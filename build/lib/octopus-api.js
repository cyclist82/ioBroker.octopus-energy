"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var octopus_api_exports = {};
__export(octopus_api_exports, {
  OctopusApiClient: () => OctopusApiClient
});
module.exports = __toCommonJS(octopus_api_exports);
var import_axios = __toESM(require("axios"));
class OctopusApiClient {
  apiUrl = "https://api.oeg-kraken.energy/v1/graphql/";
  token = "";
  tokenExpiry = null;
  axiosInstance;
  config;
  constructor(config) {
    this.config = config;
    this.axiosInstance = import_axios.default.create({
      baseURL: this.apiUrl,
      timeout: 6e4,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  /**
   * Authenticate with Octopus Energy API
   */
  async authenticate() {
    var _a;
    if (this.token && this.tokenExpiry && this.tokenExpiry > /* @__PURE__ */ new Date()) {
      return this.token;
    }
    const mutation = `
			mutation krakenTokenAuthentication($email: String!, $password: String!) {
				obtainKrakenToken(input: { email: $email, password: $password }) {
					token
					payload
				}
			}
		`;
    const variables = {
      email: this.config.email,
      password: this.config.password
    };
    const response = await this.makeGraphQLRequest(
      mutation,
      variables,
      "krakenTokenAuthentication"
    );
    const tokenData = response.obtainKrakenToken;
    if (!(tokenData == null ? void 0 : tokenData.token)) {
      throw new Error("Authentication failed: No token received");
    }
    this.token = tokenData.token;
    if ((_a = tokenData.payload) == null ? void 0 : _a.exp) {
      this.tokenExpiry = new Date(tokenData.payload.exp * 1e3);
    }
    return this.token;
  }
  /**
   * Fetch all accounts for the authenticated user
   */
  async fetchAccounts() {
    var _a;
    await this.authenticate();
    const query = `
			query getAccounts {
				viewer {
					accounts {
						... on AccountType {
							accountNumber: number
							balance
							properties {
								id
								address
								occupancyPeriods {
									effectiveFrom
									effectiveTo
								}
							}
						}
					}
				}
			}
		`;
    const response = await this.makeGraphQLRequest(
      query,
      {},
      "getAccounts",
      true
    );
    return ((_a = response.viewer) == null ? void 0 : _a.accounts) || [];
  }
  /**
   * Get comprehensive data for a specific account
   * Fetches account details, properties, rates, and devices
   * Note: completedDispatches is fetched separately as it requires a device
   */
  async getComprehensiveData(accountNumber) {
    await this.authenticate();
    const query = `
			query ComprehensiveDataQuery($accountNumber: String!) {
				account(accountNumber: $accountNumber) {
					id
					ledgers {
						balance
						ledgerType
					}
					allProperties {
						id
						electricityMalos {
							agreements {
								product {
									code
									description
									fullName
									isTimeOfUse
								}
								unitRateGrossRateInformation {
									grossRate
								}
								unitRateInformation {
									... on SimpleProductUnitRateInformation {
										__typename
										grossRateInformation {
											date
											grossRate
											rateValidToDate
											vatRate
										}
										latestGrossUnitRateCentsPerKwh
										netUnitRateCentsPerKwh
									}
									... on TimeOfUseProductUnitRateInformation {
										__typename
										rates {
											grossRateInformation {
												date
												grossRate
												rateValidToDate
												vatRate
											}
											latestGrossUnitRateCentsPerKwh
											netUnitRateCentsPerKwh
											timeslotActivationRules {
												activeFromTime
												activeToTime
											}
											timeslotName
										}
									}
								}
								unitRateForecast {
									validFrom
									validTo
									unitRateInformation {
										__typename
										... on SimpleProductUnitRateInformation {
											latestGrossUnitRateCentsPerKwh
										}
										... on TimeOfUseProductUnitRateInformation {
											rates {
												latestGrossUnitRateCentsPerKwh
											}
										}
									}
								}
								validFrom
								validTo
							}
							maloNumber
							meloNumber
							meter {
								id
								meterType
								number
								shouldReceiveSmartMeterData
								submitMeterReadingUrl
							}
							referenceConsumption
						}
						gasMalos {
							agreements {
								product {
									code
									description
									fullName
									isTimeOfUse
								}
								unitRateGrossRateInformation {
									grossRate
								}
								unitRateInformation {
									... on SimpleProductUnitRateInformation {
										__typename
										grossRateInformation {
											date
											grossRate
											rateValidToDate
											vatRate
										}
										latestGrossUnitRateCentsPerKwh
										netUnitRateCentsPerKwh
									}
									... on TimeOfUseProductUnitRateInformation {
										__typename
										rates {
											grossRateInformation {
												date
												grossRate
												rateValidToDate
												vatRate
											}
											latestGrossUnitRateCentsPerKwh
											netUnitRateCentsPerKwh
											timeslotActivationRules {
												activeFromTime
												activeToTime
											}
											timeslotName
										}
									}
								}
								validFrom
								validTo
							}
							maloNumber
							meloNumber
							meter {
								id
								meterType
								number
								shouldReceiveSmartMeterData
								submitMeterReadingUrl
							}
							referenceConsumption
						}
					}
				}
				devices(accountNumber: $accountNumber) {
					status {
						current
						currentState
						isSuspended
					}
					provider
					preferences {
						mode
						schedules {
							dayOfWeek
							max
							min
							time
						}
						targetType
						unit
						gridExport
					}
					preferenceSetting {
						deviceType
						id
						mode
						scheduleSettings {
							id
							max
							min
							step
							timeFrom
							timeStep
							timeTo
						}
						unit
					}
					name
					integrationDeviceId
					id
					deviceType
					alerts {
						message
						publishedAt
					}
					... on SmartFlexVehicle {
						id
						name
						status {
							current
							currentState
							isSuspended
						}
						vehicleVariant {
							model
							batterySize
						}
					}
				}
			}
		`;
    const variables = { accountNumber };
    const response = await this.makeGraphQLRequest(query, variables, "ComprehensiveDataQuery", true);
    let completedDispatches = [];
    if (response.devices && response.devices.length > 0) {
      try {
        const dispatchQuery = `
					query CompletedDispatchesQuery($accountNumber: String!) {
						completedDispatches(accountNumber: $accountNumber) {
							delta
							deltaKwh
							end
							endDt
							meta {
								location
								source
							}
							start
							startDt
						}
					}
				`;
        const dispatchResponse = await this.makeGraphQLRequest(
          dispatchQuery,
          variables,
          "CompletedDispatchesQuery",
          true
        );
        completedDispatches = dispatchResponse.completedDispatches || [];
      } catch (error) {
      }
    }
    return {
      account: response.account,
      devices: response.devices || [],
      completedDispatches
    };
  }
  /**
   * Legacy method for backward compatibility - uses comprehensive data query
   */
  async getAccountData(accountNumber) {
    var _a, _b;
    const comprehensiveData = await this.getComprehensiveData(accountNumber);
    if (comprehensiveData == null ? void 0 : comprehensiveData.account) {
      const account = comprehensiveData.account;
      const ledger = (_a = account.ledgers) == null ? void 0 : _a.find((l) => l.ledgerType === "ELECTRICITY_LEDGER");
      return {
        accountNumber,
        balance: (ledger == null ? void 0 : ledger.balance) || 0,
        properties: ((_b = account.allProperties) == null ? void 0 : _b.map((property) => {
          var _a2, _b2;
          return {
            id: property.id,
            address: `Property ${property.id}`,
            // Address is not directly available in comprehensive query
            occupancyPeriods: [],
            electricityMeterPoints: ((_a2 = property.electricityMalos) == null ? void 0 : _a2.map((malo) => {
              var _a3;
              return {
                id: (_a3 = malo.meter) == null ? void 0 : _a3.id,
                mpan: malo.meloNumber,
                meters: malo.meter ? [
                  {
                    id: malo.meter.id,
                    serialNumber: malo.meter.number,
                    makeAndType: malo.meter.meterType
                  }
                ] : [],
                agreements: malo.agreements || []
              };
            })) || [],
            gasMeterPoints: ((_b2 = property.gasMalos) == null ? void 0 : _b2.map((malo) => {
              var _a3;
              return {
                id: (_a3 = malo.meter) == null ? void 0 : _a3.id,
                mprn: malo.meloNumber,
                meters: malo.meter ? [
                  {
                    id: malo.meter.id,
                    serialNumber: malo.meter.number,
                    makeAndType: malo.meter.meterType
                  }
                ] : [],
                agreements: malo.agreements || []
              };
            })) || []
          };
        })) || []
      };
    }
    return null;
  }
  /**
   * Get devices associated with an account
   */
  async getDevices(_accountNumber) {
    return [];
  }
  /**
   * Get planned dispatches for an account
   */
  async getPlannedDispatches(_accountNumber) {
    return [];
  }
  /**
   * Get completed dispatches for an account
   */
  async getCompletedDispatches(_accountNumber, _startDate, _endDate) {
    return [];
  }
  /**
   * Get electricity meter readings
   */
  async getElectricityMeterReadings(accountNumber, meterId) {
    var _a, _b;
    await this.authenticate();
    const query = `
			query ElectricityMeterReadings($accountNumber: String!, $meterId: ID!) {
				electricityMeterReadings(accountNumber: $accountNumber, meterId: $meterId, first: 1) {
					edges {
						node {
							value
							readAt
							registerObisCode
							typeOfRead
							origin
							meterId
							registerType
						}
					}
				}
			}
		`;
    const variables = {
      accountNumber,
      meterId
    };
    const response = await this.makeGraphQLRequest(query, variables, "ElectricityMeterReadings", true);
    if (((_b = (_a = response.electricityMeterReadings) == null ? void 0 : _a.edges) == null ? void 0 : _b.length) > 0) {
      const reading = response.electricityMeterReadings.edges[0].node;
      return {
        startAt: reading.readAt,
        endAt: reading.readAt,
        value: reading.value,
        unit: "kWh"
      };
    }
    return null;
  }
  /**
   * Get gas meter readings
   */
  async getGasMeterReadings(accountNumber, meterId) {
    var _a, _b;
    await this.authenticate();
    const query = `
			query GasMeterReadings($accountNumber: String!, $meterId: ID!) {
				gasMeterReadings(accountNumber: $accountNumber, meterId: $meterId, first: 1) {
					edges {
						node {
							value
							readAt
							registerObisCode
							typeOfRead
							origin
							meterId
						}
					}
				}
			}
		`;
    const variables = {
      accountNumber,
      meterId
    };
    const response = await this.makeGraphQLRequest(query, variables, "GasMeterReadings", true);
    if (((_b = (_a = response.gasMeterReadings) == null ? void 0 : _a.edges) == null ? void 0 : _b.length) > 0) {
      const reading = response.gasMeterReadings.edges[0].node;
      return {
        startAt: reading.readAt,
        endAt: reading.readAt,
        value: reading.value,
        unit: "m\xB3"
      };
    }
    return null;
  }
  /**
   * Legacy method - Get smart meter readings for a property
   */
  async getSmartMeterReadings(accountNumber, propertyId, date, readingCount = 96) {
    var _a, _b, _c, _d;
    await this.authenticate();
    const query = `
			query getSmartMeterReadings($accountNumber: String!, $propertyId: ID!, $date: Date!, $readingCount: Int!) {
				account(accountNumber: $accountNumber) {
					... on AccountType {
						property(id: $propertyId) {
							measurements(
								utilityFilters: {electricityFilters: {readingFrequencyType: RAW_INTERVAL, readingQuality: COMBINED}}
								startOn: $date
								first: $readingCount
							) {
								edges {
									node {
										... on IntervalMeasurementType {
											endAt
											startAt
											unit
											value
										}
									}
								}
							}
						}
					}
				}
			}
		`;
    const variables = {
      accountNumber,
      propertyId,
      date,
      readingCount
    };
    const response = await this.makeGraphQLRequest(query, variables, "getSmartMeterReadings", true);
    return ((_d = (_c = (_b = (_a = response.account) == null ? void 0 : _a.property) == null ? void 0 : _b.measurements) == null ? void 0 : _c.edges) == null ? void 0 : _d.map((edge) => edge.node)) || [];
  }
  /**
   * Make GraphQL request with error handling and retries
   */
  async makeGraphQLRequest(query, variables = {}, operationName, isAuthenticated = false, retryCount = 0) {
    var _a, _b;
    const maxRetries = 3;
    const headers = {
      "Content-Type": "application/json"
    };
    if (isAuthenticated && this.token) {
      headers.Authorization = this.token;
    }
    try {
      const response = await this.axiosInstance.post(
        "",
        {
          query,
          variables,
          operationName
        },
        { headers }
      );
      const result = response.data;
      if (result.errors) {
        const rateLimitError = result.errors.find((e) => {
          var _a2;
          return ((_a2 = e.extensions) == null ? void 0 : _a2.errorCode) === "KT-CT-1199";
        });
        if (rateLimitError && retryCount < maxRetries) {
          const delay = Math.pow(2, retryCount) * 1e3;
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.makeGraphQLRequest(query, variables, operationName, isAuthenticated, retryCount + 1);
        }
        throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
      }
      return result.data;
    } catch (error) {
      if (((_a = error.response) == null ? void 0 : _a.status) === 401 && isAuthenticated && retryCount === 0) {
        this.token = "";
        this.tokenExpiry = null;
        await this.authenticate();
        return this.makeGraphQLRequest(query, variables, operationName, isAuthenticated, 1);
      }
      if (((_b = error.response) == null ? void 0 : _b.status) === 429 && retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1e3;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.makeGraphQLRequest(query, variables, operationName, isAuthenticated, retryCount + 1);
      }
      throw error;
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  OctopusApiClient
});
//# sourceMappingURL=octopus-api.js.map
