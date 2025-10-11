"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_node_cron = require("node-cron");
var import_octopus_api = require("./lib/octopus-api");
class OctopusEnergy extends utils.Adapter {
  apiClient = null;
  accounts = [];
  readingsUpdateCron = null;
  dailyUpdateCron = null;
  constructor(options = {}) {
    super({
      ...options,
      name: "octopus-energy"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    try {
      if (!this.config.email || !this.config.password) {
        this.log.error("Email and password must be configured");
        return;
      }
      this.apiClient = new import_octopus_api.OctopusApiClient({
        email: this.config.email,
        password: this.config.password
      });
      this.log.info("Authenticating with Octopus Energy API...");
      await this.apiClient.authenticate();
      this.log.info("Fetching accounts...");
      this.accounts = await this.apiClient.fetchAccounts();
      if (this.accounts.length === 0) {
        this.log.warn("No accounts found for the provided credentials");
        return;
      }
      this.log.info(`Found ${this.accounts.length} account(s)`);
      await this.createAccountStructures();
      await this.fetchAccountData();
      this.updateMeterReadings();
      this.updateComprehensiveData();
      this.scheduleMeterReadingsUpdates();
      this.scheduleDailyUpdates();
    } catch (error) {
      this.log.error(`Failed to initialize adapter: ${error.message}`);
    }
  }
  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   */
  onUnload(callback) {
    try {
      if (this.readingsUpdateCron) {
        this.readingsUpdateCron.stop();
        this.readingsUpdateCron = null;
      }
      if (this.dailyUpdateCron) {
        this.dailyUpdateCron.stop();
        this.dailyUpdateCron = null;
      }
      callback();
    } catch {
      callback();
    }
  }
  // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
  // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
  // /**
  //  * Is called if a subscribed object changes
  //  */
  // private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
  // 	if (obj) {
  // 		// The object was changed
  // 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
  // 	} else {
  // 		// The object was deleted
  // 		this.log.info(`object ${id} deleted`);
  // 	}
  // }
  /**
   * Is called if a subscribed state changes
   */
  onStateChange(id, state) {
    if (state) {
      this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
    } else {
      this.log.info(`state ${id} deleted`);
    }
  }
  /**
   * Create folder structure for each account
   */
  async createAccountStructures() {
    for (const account of this.accounts) {
      const accountFolder = `account_${account.accountNumber}`;
      await this.setObjectNotExistsAsync(accountFolder, {
        type: "folder",
        common: {
          name: `Account ${account.accountNumber}`
        },
        native: {}
      });
      await this.setObjectNotExistsAsync(`${accountFolder}.balance`, {
        type: "state",
        common: {
          name: "Account Balance",
          type: "number",
          role: "value.currency",
          unit: "\u20AC",
          read: true,
          write: false
        },
        native: {}
      });
      await this.setState(`${accountFolder}.balance`, { val: account.balance, ack: true });
      await this.setObjectNotExistsAsync(`${accountFolder}.lastUpdate`, {
        type: "state",
        common: {
          name: "Last Price Update",
          type: "string",
          role: "date",
          read: true,
          write: false
        },
        native: {}
      });
      await this.setObjectNotExistsAsync(`${accountFolder}.info`, {
        type: "folder",
        common: {
          name: "Account Information"
        },
        native: {}
      });
      for (const property of account.properties) {
        const propertyFolder = `${accountFolder}.property_${property.id}`;
        await this.setObjectNotExistsAsync(propertyFolder, {
          type: "folder",
          common: {
            name: `Property ${property.address || property.id}`
          },
          native: {}
        });
        await this.setObjectNotExistsAsync(`${propertyFolder}.address`, {
          type: "state",
          common: {
            name: "Address",
            type: "string",
            role: "text",
            read: true,
            write: false
          },
          native: {}
        });
        await this.setState(`${propertyFolder}.address`, { val: property.address || "", ack: true });
        const subFolders = ["electricity", "gas", "devices", "dispatches"];
        for (const folder of subFolders) {
          await this.setObjectNotExistsAsync(`${propertyFolder}.${folder}`, {
            type: "folder",
            common: {
              name: folder.charAt(0).toUpperCase() + folder.slice(1)
            },
            native: {}
          });
        }
        await this.setObjectNotExistsAsync(`${propertyFolder}.electricity.epexPricesToday`, {
          type: "state",
          common: {
            name: "EPEX Prices Today",
            type: "string",
            role: "json",
            read: true,
            write: false
          },
          native: {}
        });
        await this.setObjectNotExistsAsync(`${propertyFolder}.electricity.epexPricesTomorrow`, {
          type: "state",
          common: {
            name: "EPEX Prices Tomorrow",
            type: "string",
            role: "json",
            read: true,
            write: false
          },
          native: {}
        });
      }
      await this.setObjectNotExistsAsync(`${accountFolder}.devices`, {
        type: "folder",
        common: {
          name: "Smart Devices"
        },
        native: {}
      });
      await this.setObjectNotExistsAsync(`${accountFolder}.dispatches`, {
        type: "folder",
        common: {
          name: "Dispatches"
        },
        native: {}
      });
      await this.setObjectNotExistsAsync(`${accountFolder}.dispatches.planned`, {
        type: "folder",
        common: {
          name: "Planned Dispatches"
        },
        native: {}
      });
      await this.setObjectNotExistsAsync(`${accountFolder}.dispatches.completed`, {
        type: "folder",
        common: {
          name: "Completed Dispatches"
        },
        native: {}
      });
    }
    this.log.info("Account structures created successfully");
  }
  /**
   * Fetch comprehensive data for all accounts
   */
  async fetchAccountData() {
    var _a, _b, _c, _d, _e, _f;
    if (!this.apiClient) {
      this.log.error("API client not initialized");
      return;
    }
    for (const account of this.accounts) {
      try {
        this.log.info(`Fetching data for account ${account.accountNumber}...`);
        const accountFolder = `account_${account.accountNumber}`;
        const comprehensiveData = await this.apiClient.getComprehensiveData(account.accountNumber);
        if (comprehensiveData == null ? void 0 : comprehensiveData.account) {
          const accountData = comprehensiveData.account;
          const electricityLedger = (_a = accountData.ledgers) == null ? void 0 : _a.find(
            (l) => l.ledgerType === "ELECTRICITY_LEDGER"
          );
          if (electricityLedger) {
            await this.setState(`${accountFolder}.balance`, {
              val: electricityLedger.balance || 0,
              ack: true
            });
          }
          await this.setObjectNotExistsAsync(`${accountFolder}.info.accountId`, {
            type: "state",
            common: {
              name: "Account ID",
              type: "string",
              role: "text",
              read: true,
              write: false
            },
            native: {}
          });
          await this.setState(`${accountFolder}.info.accountId`, {
            val: accountData.id || "",
            ack: true
          });
          if (accountData.ledgers) {
            for (const ledger of accountData.ledgers) {
              const ledgerType = ((_b = ledger.ledgerType) == null ? void 0 : _b.toLowerCase().replace("_ledger", "")) || "unknown";
              await this.setObjectNotExistsAsync(`${accountFolder}.info.${ledgerType}Balance`, {
                type: "state",
                common: {
                  name: `${ledgerType.charAt(0).toUpperCase() + ledgerType.slice(1)} Balance`,
                  type: "number",
                  role: "value.currency",
                  unit: "\u20AC",
                  read: true,
                  write: false
                },
                native: {}
              });
              await this.setState(`${accountFolder}.info.${ledgerType}Balance`, {
                val: ledger.balance || 0,
                ack: true
              });
            }
          }
          if (accountData.allProperties) {
            for (const property of accountData.allProperties) {
              const propertyFolder = `${accountFolder}.property_${property.id}`;
              if (((_c = property.electricityMalos) == null ? void 0 : _c.length) > 0) {
                for (const malo of property.electricityMalos) {
                  const maloFolder = `${propertyFolder}.electricity.malo_${malo.maloNumber}`;
                  await this.setObjectNotExistsAsync(maloFolder, {
                    type: "folder",
                    common: {
                      name: `Electricity Supply ${malo.maloNumber}`
                    },
                    native: {}
                  });
                  await this.setObjectNotExistsAsync(`${maloFolder}.mpan`, {
                    type: "state",
                    common: {
                      name: "MPAN",
                      type: "string",
                      role: "text",
                      read: true,
                      write: false
                    },
                    native: {}
                  });
                  await this.setState(`${maloFolder}.mpan`, {
                    val: malo.meloNumber || "",
                    ack: true
                  });
                  if (malo.referenceConsumption !== void 0) {
                    await this.setObjectNotExistsAsync(`${maloFolder}.referenceConsumption`, {
                      type: "state",
                      common: {
                        name: "Reference Consumption",
                        type: "number",
                        role: "value.power.consumption",
                        unit: "kWh",
                        read: true,
                        write: false
                      },
                      native: {}
                    });
                    await this.setState(`${maloFolder}.referenceConsumption`, {
                      val: malo.referenceConsumption || 0,
                      ack: true
                    });
                  }
                  if (((_d = malo.agreements) == null ? void 0 : _d.length) > 0) {
                    const currentAgreement = malo.agreements[0];
                    const agreementFolder = `${maloFolder}.currentAgreement`;
                    await this.setObjectNotExistsAsync(agreementFolder, {
                      type: "folder",
                      common: {
                        name: "Current Agreement"
                      },
                      native: {}
                    });
                    if (currentAgreement.product) {
                      await this.setObjectNotExistsAsync(`${agreementFolder}.productCode`, {
                        type: "state",
                        common: {
                          name: "Product Code",
                          type: "string",
                          role: "text",
                          read: true,
                          write: false
                        },
                        native: {}
                      });
                      await this.setState(`${agreementFolder}.productCode`, {
                        val: currentAgreement.product.code || "",
                        ack: true
                      });
                      await this.setObjectNotExistsAsync(`${agreementFolder}.productName`, {
                        type: "state",
                        common: {
                          name: "Product Name",
                          type: "string",
                          role: "text",
                          read: true,
                          write: false
                        },
                        native: {}
                      });
                      await this.setState(`${agreementFolder}.productName`, {
                        val: currentAgreement.product.fullName || "",
                        ack: true
                      });
                      await this.setObjectNotExistsAsync(`${agreementFolder}.isTimeOfUse`, {
                        type: "state",
                        common: {
                          name: "Is Time of Use Tariff",
                          type: "boolean",
                          role: "indicator",
                          read: true,
                          write: false
                        },
                        native: {}
                      });
                      await this.setState(`${agreementFolder}.isTimeOfUse`, {
                        val: currentAgreement.product.isTimeOfUse || false,
                        ack: true
                      });
                    }
                    if (currentAgreement.unitRateInformation) {
                      const rateInfo = currentAgreement.unitRateInformation;
                      if (rateInfo.__typename === "SimpleProductUnitRateInformation") {
                        if (rateInfo.latestGrossUnitRateCentsPerKwh !== void 0) {
                          await this.setObjectNotExistsAsync(
                            `${agreementFolder}.currentRate`,
                            {
                              type: "state",
                              common: {
                                name: "Current Rate",
                                type: "number",
                                role: "value.price",
                                unit: "ct/kWh",
                                read: true,
                                write: false
                              },
                              native: {}
                            }
                          );
                          await this.setState(`${agreementFolder}.currentRate`, {
                            val: rateInfo.latestGrossUnitRateCentsPerKwh / 100,
                            ack: true
                          });
                        }
                      } else if (rateInfo.__typename === "TimeOfUseProductUnitRateInformation" && rateInfo.rates) {
                        const ratesFolder = `${agreementFolder}.timeOfUseRates`;
                        await this.setObjectNotExistsAsync(ratesFolder, {
                          type: "folder",
                          common: {
                            name: "Time of Use Rates"
                          },
                          native: {}
                        });
                        for (const rate of rateInfo.rates) {
                          const slotName = rate.timeslotName || "unknown";
                          const slotFolder = `${ratesFolder}.${slotName.toLowerCase().replace(/\s+/g, "_")}`;
                          await this.setObjectNotExistsAsync(slotFolder, {
                            type: "folder",
                            common: {
                              name: slotName
                            },
                            native: {}
                          });
                          if (rate.latestGrossUnitRateCentsPerKwh !== void 0) {
                            await this.setObjectNotExistsAsync(`${slotFolder}.rate`, {
                              type: "state",
                              common: {
                                name: "Rate",
                                type: "number",
                                role: "value.price",
                                unit: "ct/kWh",
                                read: true,
                                write: false
                              },
                              native: {}
                            });
                            await this.setState(`${slotFolder}.rate`, {
                              val: rate.latestGrossUnitRateCentsPerKwh / 100,
                              ack: true
                            });
                          }
                          if (rate.timeslotActivationRules) {
                            await this.setObjectNotExistsAsync(`${slotFolder}.activeFrom`, {
                              type: "state",
                              common: {
                                name: "Active From",
                                type: "string",
                                role: "text",
                                read: true,
                                write: false
                              },
                              native: {}
                            });
                            await this.setState(`${slotFolder}.activeFrom`, {
                              val: rate.timeslotActivationRules.activeFromTime || "",
                              ack: true
                            });
                            await this.setObjectNotExistsAsync(`${slotFolder}.activeTo`, {
                              type: "state",
                              common: {
                                name: "Active To",
                                type: "string",
                                role: "text",
                                read: true,
                                write: false
                              },
                              native: {}
                            });
                            await this.setState(`${slotFolder}.activeTo`, {
                              val: rate.timeslotActivationRules.activeToTime || "",
                              ack: true
                            });
                          }
                        }
                      }
                    }
                  }
                }
                if (((_e = property.gasMalos) == null ? void 0 : _e.length) > 0) {
                  for (const malo of property.gasMalos) {
                    const maloFolder = `${propertyFolder}.gas.malo_${malo.maloNumber}`;
                    await this.setObjectNotExistsAsync(maloFolder, {
                      type: "folder",
                      common: {
                        name: `Gas Supply ${malo.maloNumber}`
                      },
                      native: {}
                    });
                    await this.setObjectNotExistsAsync(`${maloFolder}.mprn`, {
                      type: "state",
                      common: {
                        name: "MPRN",
                        type: "string",
                        role: "text",
                        read: true,
                        write: false
                      },
                      native: {}
                    });
                    await this.setState(`${maloFolder}.mprn`, {
                      val: malo.meloNumber || "",
                      ack: true
                    });
                  }
                }
              }
            }
          }
        }
        await this.setObjectNotExistsAsync(`${accountFolder}.info.deviceCount`, {
          type: "state",
          common: {
            name: "Device Count",
            type: "number",
            role: "value",
            read: true,
            write: false
          },
          native: {}
        });
        await this.setState(`${accountFolder}.info.deviceCount`, {
          val: ((_f = comprehensiveData.devices) == null ? void 0 : _f.length) || 0,
          ack: true
        });
        await this.setObjectNotExistsAsync(`${accountFolder}.info.rawData`, {
          type: "state",
          common: {
            name: "Raw Comprehensive Data",
            type: "string",
            role: "json",
            read: true,
            write: false
          },
          native: {}
        });
        await this.setState(`${accountFolder}.info.rawData`, {
          val: JSON.stringify(comprehensiveData),
          ack: true
        });
        await this.setState(`${accountFolder}.lastUpdate`, {
          val: (/* @__PURE__ */ new Date()).toISOString(),
          ack: true
        });
        const devices = await this.apiClient.getDevices(account.accountNumber);
        this.log.debug(`Found ${devices.length} device(s) for account ${account.accountNumber}`);
        for (const device of devices) {
          const deviceFolder = `${accountFolder}.devices.${device.krakenflexDeviceId || device.id}`;
          await this.setObjectNotExistsAsync(deviceFolder, {
            type: "folder",
            common: {
              name: `${device.vehicleMake || "Device"} ${device.vehicleModel || ""}`.trim()
            },
            native: {}
          });
          if (device.status) {
            await this.setObjectNotExistsAsync(`${deviceFolder}.currentState`, {
              type: "state",
              common: {
                name: "Current State",
                type: "string",
                role: "text",
                read: true,
                write: false
              },
              native: {}
            });
            await this.setState(`${deviceFolder}.currentState`, {
              val: device.status.currentState,
              ack: true
            });
            await this.setObjectNotExistsAsync(`${deviceFolder}.isConnected`, {
              type: "state",
              common: {
                name: "Is Connected",
                type: "boolean",
                role: "indicator.connected",
                read: true,
                write: false
              },
              native: {}
            });
            await this.setState(`${deviceFolder}.isConnected`, {
              val: device.status.isConnected,
              ack: true
            });
            if (device.status.currentBatteryLevel !== void 0) {
              await this.setObjectNotExistsAsync(`${deviceFolder}.batteryLevel`, {
                type: "state",
                common: {
                  name: "Battery Level",
                  type: "number",
                  role: "value.battery",
                  unit: "%",
                  read: true,
                  write: false
                },
                native: {}
              });
              await this.setState(`${deviceFolder}.batteryLevel`, {
                val: device.status.currentBatteryLevel,
                ack: true
              });
            }
          }
        }
        const plannedDispatches = await this.apiClient.getPlannedDispatches(account.accountNumber);
        this.log.debug(
          `Found ${plannedDispatches.length} planned dispatch(es) for account ${account.accountNumber}`
        );
        await this.setObjectNotExistsAsync(`${accountFolder}.dispatches.planned.data`, {
          type: "state",
          common: {
            name: "Planned Dispatches Data",
            type: "string",
            role: "json",
            read: true,
            write: false
          },
          native: {}
        });
        await this.setState(`${accountFolder}.dispatches.planned.data`, {
          val: JSON.stringify(plannedDispatches),
          ack: true
        });
        const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        const completedDispatches = await this.apiClient.getCompletedDispatches(account.accountNumber, today);
        this.log.debug(
          `Found ${completedDispatches.length} completed dispatch(es) for account ${account.accountNumber}`
        );
        await this.setObjectNotExistsAsync(`${accountFolder}.dispatches.completed.data`, {
          type: "state",
          common: {
            name: "Completed Dispatches Data",
            type: "string",
            role: "json",
            read: true,
            write: false
          },
          native: {}
        });
        await this.setState(`${accountFolder}.dispatches.completed.data`, {
          val: JSON.stringify(completedDispatches),
          ack: true
        });
        for (const property of account.properties) {
          const propertyFolder = `${accountFolder}.property_${property.id}`;
          try {
            const readings = await this.apiClient.getSmartMeterReadings(
              account.accountNumber,
              property.id,
              today
            );
            this.log.debug(`Found ${readings.length} meter reading(s) for property ${property.id}`);
            await this.setObjectNotExistsAsync(`${propertyFolder}.electricity.readings`, {
              type: "state",
              common: {
                name: "Meter Readings",
                type: "string",
                role: "json",
                read: true,
                write: false
              },
              native: {}
            });
            await this.setState(`${propertyFolder}.electricity.readings`, {
              val: JSON.stringify(readings),
              ack: true
            });
          } catch (error) {
            this.log.warn(`Failed to fetch meter readings for property ${property.id}: ${error.message}`);
          }
        }
      } catch (error) {
        this.log.error(`Failed to fetch data for account ${account.accountNumber}: ${error.message}`);
      }
    }
  }
  /**
   * Schedule meter readings updates at 0, 15, 30, 45 minutes of every hour
   */
  scheduleMeterReadingsUpdates() {
    const cronPattern = "0,15,30,45 * * * *";
    this.log.info(
      "Scheduling meter readings updates at 0, 15, 30, and 45 minutes of every hour (with random delay)"
    );
    this.readingsUpdateCron = (0, import_node_cron.schedule)(
      cronPattern,
      () => {
        const randomDelay = Math.floor(Math.random() * 3e5);
        const delayMinutes = (randomDelay / 6e4).toFixed(1);
        this.log.debug(`Meter readings update triggered, waiting ${delayMinutes} minutes before execution`);
        setTimeout(() => {
          this.updateMeterReadings();
        }, randomDelay);
      },
      {
        timezone: "Europe/Berlin"
        // Use German timezone for Octopus Energy Germany
      }
    );
    this.readingsUpdateCron.start();
  }
  /**
   * Schedule daily updates for everything else (balance, rates, etc.) after midnight
   */
  scheduleDailyUpdates() {
    const cronPattern = "0 0 * * *";
    this.log.info("Scheduling daily comprehensive updates at midnight (with 0-15 min random delay)");
    this.dailyUpdateCron = (0, import_node_cron.schedule)(
      cronPattern,
      async () => {
        await this.rotateEpexPrices();
        const randomDelay = Math.floor(Math.random() * 9e5);
        const delayMinutes = (randomDelay / 6e4).toFixed(1);
        this.log.debug(`Daily update triggered at midnight, waiting ${delayMinutes} minutes before execution`);
        setTimeout(() => {
          this.updateComprehensiveData();
        }, randomDelay);
      },
      {
        timezone: "Europe/Berlin"
        // Use German timezone for Octopus Energy Germany
      }
    );
    this.dailyUpdateCron.start();
    const initialDelay = 5e3 + Math.floor(Math.random() * 1e4);
    setTimeout(() => {
      this.log.info("Running initial comprehensive data update");
      this.updateComprehensiveData();
    }, initialDelay);
  }
  /**
   * Rotate EPEX prices at midnight: move tomorrow's prices to today
   * No network requests - just state manipulation
   */
  async rotateEpexPrices() {
    this.log.info("Rotating EPEX prices at midnight: moving tomorrow to today");
    for (const account of this.accounts) {
      try {
        const accountFolder = `account_${account.accountNumber}`;
        for (const property of account.properties) {
          const propertyFolder = `${accountFolder}.property_${property.id}`;
          try {
            const tomorrowState = await this.getStateAsync(
              `${propertyFolder}.electricity.epexPricesTomorrow`
            );
            if (tomorrowState == null ? void 0 : tomorrowState.val) {
              await this.setState(`${propertyFolder}.electricity.epexPricesToday`, {
                val: tomorrowState.val,
                ack: true
              });
              this.log.debug(`Rotated EPEX prices for property ${property.id}`);
            }
            await this.setState(`${propertyFolder}.electricity.epexPricesTomorrow`, {
              val: JSON.stringify([]),
              ack: true
            });
          } catch (error) {
            this.log.warn(`Failed to rotate EPEX prices for property ${property.id}: ${error.message}`);
          }
        }
      } catch (error) {
        this.log.error(`Failed to rotate EPEX prices for account ${account.accountNumber}: ${error.message}`);
      }
    }
  }
  /**
   * Update only meter readings for all accounts (runs every 15 minutes)
   */
  async updateMeterReadings() {
    var _a, _b;
    if (!this.apiClient) {
      this.log.warn("API client not initialized, skipping meter readings update");
      return;
    }
    this.log.info("Updating meter readings...");
    for (const account of this.accounts) {
      try {
        const accountFolder = `account_${account.accountNumber}`;
        const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        const comprehensiveData = await this.apiClient.getComprehensiveData(account.accountNumber);
        if ((_a = comprehensiveData == null ? void 0 : comprehensiveData.account) == null ? void 0 : _a.allProperties) {
          for (const property of comprehensiveData.account.allProperties) {
            const propertyFolder = `${accountFolder}.property_${property.id}`;
            try {
              const readings = await this.apiClient.getSmartMeterReadings(
                account.accountNumber,
                property.id,
                today
              );
              if (readings.length > 0) {
                await this.setState(`${propertyFolder}.electricity.readings`, {
                  val: JSON.stringify(readings),
                  ack: true
                });
                this.log.debug(
                  `Updated ${readings.length} smart meter readings for property ${property.id}`
                );
              }
            } catch (error) {
              this.log.debug(
                `Failed to fetch smart meter readings for property ${property.id}: ${error.message}`
              );
            }
            try {
              const now = /* @__PURE__ */ new Date();
              const todayStart = new Date(now);
              todayStart.setHours(0, 0, 0, 0);
              const tomorrowEnd = new Date(now);
              tomorrowEnd.setDate(tomorrowEnd.getDate() + 2);
              tomorrowEnd.setHours(0, 0, 0, 0);
              const epexData = await this.apiClient.getEpexPrices(
                account.accountNumber,
                property.id,
                todayStart.toISOString(),
                tomorrowEnd.toISOString()
              );
              if ((_b = epexData == null ? void 0 : epexData.epexDayAheadPrices) == null ? void 0 : _b.edges) {
                const prices = epexData.epexDayAheadPrices.edges.map((edge) => edge.node);
                const todayMidnight = new Date(now);
                todayMidnight.setHours(0, 0, 0, 0);
                const tomorrowMidnight = new Date(now);
                tomorrowMidnight.setDate(tomorrowMidnight.getDate() + 1);
                tomorrowMidnight.setHours(0, 0, 0, 0);
                const todayPrices = prices.filter((price) => {
                  const priceDate = new Date(price.periodStart);
                  return priceDate >= todayMidnight && priceDate < tomorrowMidnight;
                });
                const tomorrowPrices = prices.filter((price) => {
                  const priceDate = new Date(price.periodStart);
                  return priceDate >= tomorrowMidnight;
                });
                await this.setState(`${propertyFolder}.electricity.epexPricesToday`, {
                  val: JSON.stringify(todayPrices),
                  ack: true
                });
                await this.setState(`${propertyFolder}.electricity.epexPricesTomorrow`, {
                  val: JSON.stringify(tomorrowPrices),
                  ack: true
                });
                this.log.debug(
                  `Updated EPEX prices for property ${property.id}: ${todayPrices.length} today, ${tomorrowPrices.length} tomorrow`
                );
              }
            } catch (error) {
              this.log.debug(`Failed to fetch EPEX prices for property ${property.id}: ${error.message}`);
            }
          }
        }
        this.log.info(`Successfully updated meter readings for account ${account.accountNumber}`);
      } catch (error) {
        this.log.error(
          `Failed to update meter readings for account ${account.accountNumber}: ${error.message}`
        );
      }
    }
  }
  /**
   * Update comprehensive data including balance, rates, and device info (runs once daily)
   */
  async updateComprehensiveData() {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!this.apiClient) {
      this.log.warn("API client not initialized, skipping comprehensive update");
      return;
    }
    this.log.info("Updating comprehensive data (balance, rates, devices)...");
    for (const account of this.accounts) {
      try {
        const accountFolder = `account_${account.accountNumber}`;
        const comprehensiveData = await this.apiClient.getComprehensiveData(account.accountNumber);
        if (comprehensiveData == null ? void 0 : comprehensiveData.account) {
          const accountData = comprehensiveData.account;
          const electricityLedger = (_a = accountData.ledgers) == null ? void 0 : _a.find(
            (l) => l.ledgerType === "ELECTRICITY_LEDGER"
          );
          if (electricityLedger) {
            await this.setState(`${accountFolder}.balance`, {
              val: electricityLedger.balance || 0,
              ack: true
            });
          }
          if (accountData.ledgers) {
            for (const ledger of accountData.ledgers) {
              const ledgerType = ((_b = ledger.ledgerType) == null ? void 0 : _b.toLowerCase().replace("_ledger", "")) || "unknown";
              await this.setState(`${accountFolder}.info.${ledgerType}Balance`, {
                val: ledger.balance || 0,
                ack: true
              });
            }
          }
          if (accountData.allProperties) {
            for (const property of accountData.allProperties) {
              const propertyFolder = `${accountFolder}.property_${property.id}`;
              if (((_c = property.electricityMalos) == null ? void 0 : _c.length) > 0) {
                for (const malo of property.electricityMalos) {
                  const maloFolder = `${propertyFolder}.electricity.malo_${malo.maloNumber}`;
                  if (((_d = malo.agreements) == null ? void 0 : _d.length) > 0) {
                    const currentAgreement = malo.agreements[0];
                    const agreementFolder = `${maloFolder}.currentAgreement`;
                    if (currentAgreement.unitRateInformation) {
                      const rateInfo = currentAgreement.unitRateInformation;
                      if (rateInfo.__typename === "SimpleProductUnitRateInformation" && rateInfo.latestGrossUnitRateCentsPerKwh !== void 0) {
                        await this.setState(`${agreementFolder}.currentRate`, {
                          val: rateInfo.latestGrossUnitRateCentsPerKwh / 100,
                          ack: true
                        });
                        this.log.debug(
                          `Updated electricity rate for ${malo.maloNumber}: ${(rateInfo.latestGrossUnitRateCentsPerKwh / 100).toFixed(2)} ct/kWh`
                        );
                      } else if (rateInfo.__typename === "TimeOfUseProductUnitRateInformation" && rateInfo.rates) {
                        const ratesFolder = `${agreementFolder}.timeOfUseRates`;
                        for (const rate of rateInfo.rates) {
                          const slotName = rate.timeslotName || "unknown";
                          const slotFolder = `${ratesFolder}.${slotName.toLowerCase().replace(/\s+/g, "_")}`;
                          if (rate.latestGrossUnitRateCentsPerKwh !== void 0) {
                            await this.setState(`${slotFolder}.rate`, {
                              val: rate.latestGrossUnitRateCentsPerKwh / 100,
                              ack: true
                            });
                            this.log.debug(
                              `Updated ${slotName} rate: ${(rate.latestGrossUnitRateCentsPerKwh / 100).toFixed(2)} ct/kWh`
                            );
                          }
                        }
                      }
                    }
                  }
                }
              }
              if (((_e = property.gasMalos) == null ? void 0 : _e.length) > 0) {
                for (const malo of property.gasMalos) {
                  const maloFolder = `${propertyFolder}.gas.malo_${malo.maloNumber}`;
                  if (((_f = malo.agreements) == null ? void 0 : _f.length) > 0) {
                    const currentAgreement = malo.agreements[0];
                    const agreementFolder = `${maloFolder}.currentAgreement`;
                    if (((_g = currentAgreement.unitRateInformation) == null ? void 0 : _g.__typename) === "SimpleProductUnitRateInformation" && currentAgreement.unitRateInformation.latestGrossUnitRateCentsPerKwh !== void 0) {
                      await this.setState(`${agreementFolder}.currentRate`, {
                        val: currentAgreement.unitRateInformation.latestGrossUnitRateCentsPerKwh / 100,
                        ack: true
                      });
                      this.log.debug(
                        `Updated gas rate for ${malo.maloNumber}: ${(currentAgreement.unitRateInformation.latestGrossUnitRateCentsPerKwh / 100).toFixed(2)} ct/kWh`
                      );
                    }
                  }
                }
              }
            }
          }
          await this.setState(`${accountFolder}.info.deviceCount`, {
            val: ((_h = comprehensiveData.devices) == null ? void 0 : _h.length) || 0,
            ack: true
          });
          await this.setState(`${accountFolder}.info.rawData`, {
            val: JSON.stringify(comprehensiveData),
            ack: true
          });
          await this.setState(`${accountFolder}.lastUpdate`, {
            val: (/* @__PURE__ */ new Date()).toISOString(),
            ack: true
          });
        }
        this.log.info(`Successfully updated comprehensive data for account ${account.accountNumber}`);
      } catch (error) {
        this.log.error(
          `Failed to update comprehensive data for account ${account.accountNumber}: ${error.message}`
        );
      }
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new OctopusEnergy(options);
} else {
  (() => new OctopusEnergy())();
}
//# sourceMappingURL=main.js.map
