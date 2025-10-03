import * as utils from '@iobroker/adapter-core';
import { ScheduledTask, schedule } from 'node-cron';
import { Account } from './lib/dto';
import { OctopusApiClient } from './lib/octopus-api';

class OctopusEnergy extends utils.Adapter {
	private apiClient: OctopusApiClient | null = null;
	private accounts: Account[] = [];
	private readingsUpdateCron: ScheduledTask | null = null;
	private dailyUpdateCron: ScheduledTask | null = null;

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: 'octopus-energy',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on('objectChange', this.onObjectChange.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	private async onReady(): Promise<void> {
		// Initialize your adapter here
		try {
			// Validate configuration
			if (!this.config.email || !this.config.password) {
				this.log.error('Email and password must be configured');
				return;
			}

			// Initialize API client
			this.apiClient = new OctopusApiClient({
				email: this.config.email,
				password: this.config.password,
			});

			// Authenticate and fetch accounts
			this.log.info('Authenticating with Octopus Energy API...');
			await this.apiClient.authenticate();

			this.log.info('Fetching accounts...');
			this.accounts = await this.apiClient.fetchAccounts();

			if (this.accounts.length === 0) {
				this.log.warn('No accounts found for the provided credentials');
				return;
			}

			this.log.info(`Found ${this.accounts.length} account(s)`);

			// Create folder structure for each account
			await this.createAccountStructures();

			// Fetch initial data for each account
			await this.fetchAccountData();

			// Schedule regular updates
			this.scheduleMeterReadingsUpdates(); // Every 15 minutes
			this.scheduleDailyUpdates(); // Once daily after midnight
		} catch (error: any) {
			this.log.error(`Failed to initialize adapter: ${error.message}`);
		}
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 */
	private onUnload(callback: () => void): void {
		try {
			// Stop the cron jobs
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
	private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	/**
	 * Create folder structure for each account
	 */
	private async createAccountStructures(): Promise<void> {
		for (const account of this.accounts) {
			const accountFolder = `account_${account.accountNumber}`;

			// Create account folder
			await this.setObjectNotExistsAsync(accountFolder, {
				type: 'folder',
				common: {
					name: `Account ${account.accountNumber}`,
				},
				native: {},
			});

			// Create balance state
			await this.setObjectNotExistsAsync(`${accountFolder}.balance`, {
				type: 'state',
				common: {
					name: 'Account Balance',
					type: 'number',
					role: 'value.currency',
					unit: '€',
					read: true,
					write: false,
				},
				native: {},
			});

			// Set initial balance
			await this.setState(`${accountFolder}.balance`, { val: account.balance, ack: true });

			// Create last update state
			await this.setObjectNotExistsAsync(`${accountFolder}.lastUpdate`, {
				type: 'state',
				common: {
					name: 'Last Price Update',
					type: 'string',
					role: 'date',
					read: true,
					write: false,
				},
				native: {},
			});

			// Create info folder for comprehensive account data
			await this.setObjectNotExistsAsync(`${accountFolder}.info`, {
				type: 'folder',
				common: {
					name: 'Account Information',
				},
				native: {},
			});

			// Create properties folder
			for (const property of account.properties) {
				const propertyFolder = `${accountFolder}.property_${property.id}`;

				await this.setObjectNotExistsAsync(propertyFolder, {
					type: 'folder',
					common: {
						name: `Property ${property.address || property.id}`,
					},
					native: {},
				});

				// Create address info
				await this.setObjectNotExistsAsync(`${propertyFolder}.address`, {
					type: 'state',
					common: {
						name: 'Address',
						type: 'string',
						role: 'text',
						read: true,
						write: false,
					},
					native: {},
				});

				await this.setState(`${propertyFolder}.address`, { val: property.address || '', ack: true });

				// Create folders for different data types
				const subFolders = ['electricity', 'gas', 'devices', 'dispatches'];
				for (const folder of subFolders) {
					await this.setObjectNotExistsAsync(`${propertyFolder}.${folder}`, {
						type: 'folder',
						common: {
							name: folder.charAt(0).toUpperCase() + folder.slice(1),
						},
						native: {},
					});
				}
			}

			// Create devices folder
			await this.setObjectNotExistsAsync(`${accountFolder}.devices`, {
				type: 'folder',
				common: {
					name: 'Smart Devices',
				},
				native: {},
			});

			// Create dispatches folder
			await this.setObjectNotExistsAsync(`${accountFolder}.dispatches`, {
				type: 'folder',
				common: {
					name: 'Dispatches',
				},
				native: {},
			});

			await this.setObjectNotExistsAsync(`${accountFolder}.dispatches.planned`, {
				type: 'folder',
				common: {
					name: 'Planned Dispatches',
				},
				native: {},
			});

			await this.setObjectNotExistsAsync(`${accountFolder}.dispatches.completed`, {
				type: 'folder',
				common: {
					name: 'Completed Dispatches',
				},
				native: {},
			});
		}

		this.log.info('Account structures created successfully');
	}

	/**
	 * Fetch comprehensive data for all accounts
	 */
	private async fetchAccountData(): Promise<void> {
		if (!this.apiClient) {
			this.log.error('API client not initialized');
			return;
		}

		for (const account of this.accounts) {
			try {
				this.log.info(`Fetching data for account ${account.accountNumber}...`);
				const accountFolder = `account_${account.accountNumber}`;

				// Fetch comprehensive account data
				const comprehensiveData = await this.apiClient.getComprehensiveData(account.accountNumber);

				// Store comprehensive data in info folder
				if (comprehensiveData?.account) {
					const accountData = comprehensiveData.account;

					// Update balance from ledgers
					const electricityLedger = accountData.ledgers?.find(
						(l: any) => l.ledgerType === 'ELECTRICITY_LEDGER',
					);
					if (electricityLedger) {
						await this.setState(`${accountFolder}.balance`, {
							val: electricityLedger.balance || 0,
							ack: true,
						});
					}

					// Store account ID
					await this.setObjectNotExistsAsync(`${accountFolder}.info.accountId`, {
						type: 'state',
						common: {
							name: 'Account ID',
							type: 'string',
							role: 'text',
							read: true,
							write: false,
						},
						native: {},
					});
					await this.setState(`${accountFolder}.info.accountId`, {
						val: accountData.id || '',
						ack: true,
					});

					// Store ledgers information
					if (accountData.ledgers) {
						for (const ledger of accountData.ledgers) {
							const ledgerType = ledger.ledgerType?.toLowerCase().replace('_ledger', '') || 'unknown';
							await this.setObjectNotExistsAsync(`${accountFolder}.info.${ledgerType}Balance`, {
								type: 'state',
								common: {
									name: `${ledgerType.charAt(0).toUpperCase() + ledgerType.slice(1)} Balance`,
									type: 'number',
									role: 'value.currency',
									unit: '€',
									read: true,
									write: false,
								},
								native: {},
							});
							await this.setState(`${accountFolder}.info.${ledgerType}Balance`, {
								val: ledger.balance || 0,
								ack: true,
							});
						}
					}

					// Process properties with enhanced data
					if (accountData.allProperties) {
						for (const property of accountData.allProperties) {
							const propertyFolder = `${accountFolder}.property_${property.id}`;

							// Process electricity MALOs
							if (property.electricityMalos?.length > 0) {
								for (const malo of property.electricityMalos) {
									// Store MALO information
									const maloFolder = `${propertyFolder}.electricity.malo_${malo.maloNumber}`;
									await this.setObjectNotExistsAsync(maloFolder, {
										type: 'folder',
										common: {
											name: `Electricity Supply ${malo.maloNumber}`,
										},
										native: {},
									});

									// Store MELO (MPAN) number
									await this.setObjectNotExistsAsync(`${maloFolder}.mpan`, {
										type: 'state',
										common: {
											name: 'MPAN',
											type: 'string',
											role: 'text',
											read: true,
											write: false,
										},
										native: {},
									});
									await this.setState(`${maloFolder}.mpan`, {
										val: malo.meloNumber || '',
										ack: true,
									});

									// Store reference consumption
									if (malo.referenceConsumption !== undefined) {
										await this.setObjectNotExistsAsync(`${maloFolder}.referenceConsumption`, {
											type: 'state',
											common: {
												name: 'Reference Consumption',
												type: 'number',
												role: 'value.power.consumption',
												unit: 'kWh',
												read: true,
												write: false,
											},
											native: {},
										});
										await this.setState(`${maloFolder}.referenceConsumption`, {
											val: malo.referenceConsumption || 0,
											ack: true,
										});
									}

									// Process current agreement
									if (malo.agreements?.length > 0) {
										const currentAgreement = malo.agreements[0]; // Usually the first is current
										const agreementFolder = `${maloFolder}.currentAgreement`;

										await this.setObjectNotExistsAsync(agreementFolder, {
											type: 'folder',
											common: {
												name: 'Current Agreement',
											},
											native: {},
										});

										// Product information
										if (currentAgreement.product) {
											await this.setObjectNotExistsAsync(`${agreementFolder}.productCode`, {
												type: 'state',
												common: {
													name: 'Product Code',
													type: 'string',
													role: 'text',
													read: true,
													write: false,
												},
												native: {},
											});
											await this.setState(`${agreementFolder}.productCode`, {
												val: currentAgreement.product.code || '',
												ack: true,
											});

											await this.setObjectNotExistsAsync(`${agreementFolder}.productName`, {
												type: 'state',
												common: {
													name: 'Product Name',
													type: 'string',
													role: 'text',
													read: true,
													write: false,
												},
												native: {},
											});
											await this.setState(`${agreementFolder}.productName`, {
												val: currentAgreement.product.fullName || '',
												ack: true,
											});

											await this.setObjectNotExistsAsync(`${agreementFolder}.isTimeOfUse`, {
												type: 'state',
												common: {
													name: 'Is Time of Use Tariff',
													type: 'boolean',
													role: 'indicator',
													read: true,
													write: false,
												},
												native: {},
											});
											await this.setState(`${agreementFolder}.isTimeOfUse`, {
												val: currentAgreement.product.isTimeOfUse || false,
												ack: true,
											});
										}

										// Unit rate information
										if (currentAgreement.unitRateInformation) {
											const rateInfo = currentAgreement.unitRateInformation;

											if (rateInfo.__typename === 'SimpleProductUnitRateInformation') {
												// Simple rate
												if (rateInfo.latestGrossUnitRateCentsPerKwh !== undefined) {
													await this.setObjectNotExistsAsync(
														`${agreementFolder}.currentRate`,
														{
															type: 'state',
															common: {
																name: 'Current Rate',
																type: 'number',
																role: 'value.price',
																unit: 'ct/kWh',
																read: true,
																write: false,
															},
															native: {},
														},
													);
													await this.setState(`${agreementFolder}.currentRate`, {
														val: rateInfo.latestGrossUnitRateCentsPerKwh / 100,
														ack: true,
													});
												}
											} else if (
												rateInfo.__typename === 'TimeOfUseProductUnitRateInformation' &&
												rateInfo.rates
											) {
												// Time of use rates
												const ratesFolder = `${agreementFolder}.timeOfUseRates`;
												await this.setObjectNotExistsAsync(ratesFolder, {
													type: 'folder',
													common: {
														name: 'Time of Use Rates',
													},
													native: {},
												});

												for (const rate of rateInfo.rates) {
													const slotName = rate.timeslotName || 'unknown';
													const slotFolder = `${ratesFolder}.${slotName.toLowerCase().replace(/\s+/g, '_')}`;

													await this.setObjectNotExistsAsync(slotFolder, {
														type: 'folder',
														common: {
															name: slotName,
														},
														native: {},
													});

													if (rate.latestGrossUnitRateCentsPerKwh !== undefined) {
														await this.setObjectNotExistsAsync(`${slotFolder}.rate`, {
															type: 'state',
															common: {
																name: 'Rate',
																type: 'number',
																role: 'value.price',
																unit: 'ct/kWh',
																read: true,
																write: false,
															},
															native: {},
														});
														await this.setState(`${slotFolder}.rate`, {
															val: rate.latestGrossUnitRateCentsPerKwh / 100,
															ack: true,
														});
													}

													if (rate.timeslotActivationRules) {
														await this.setObjectNotExistsAsync(`${slotFolder}.activeFrom`, {
															type: 'state',
															common: {
																name: 'Active From',
																type: 'string',
																role: 'text',
																read: true,
																write: false,
															},
															native: {},
														});
														await this.setState(`${slotFolder}.activeFrom`, {
															val: rate.timeslotActivationRules.activeFromTime || '',
															ack: true,
														});

														await this.setObjectNotExistsAsync(`${slotFolder}.activeTo`, {
															type: 'state',
															common: {
																name: 'Active To',
																type: 'string',
																role: 'text',
																read: true,
																write: false,
															},
															native: {},
														});
														await this.setState(`${slotFolder}.activeTo`, {
															val: rate.timeslotActivationRules.activeToTime || '',
															ack: true,
														});
													}
												}
											}
										}
									}
								}

								// Process gas MALOs similarly
								if (property.gasMalos?.length > 0) {
									for (const malo of property.gasMalos) {
										const maloFolder = `${propertyFolder}.gas.malo_${malo.maloNumber}`;
										await this.setObjectNotExistsAsync(maloFolder, {
											type: 'folder',
											common: {
												name: `Gas Supply ${malo.maloNumber}`,
											},
											native: {},
										});

										// Store MPRN
										await this.setObjectNotExistsAsync(`${maloFolder}.mprn`, {
											type: 'state',
											common: {
												name: 'MPRN',
												type: 'string',
												role: 'text',
												read: true,
												write: false,
											},
											native: {},
										});
										await this.setState(`${maloFolder}.mprn`, {
											val: malo.meloNumber || '',
											ack: true,
										});

										// Similar processing for gas agreements...
									}
								}
							}
						}
					}
				}

				// Store device count in info
				await this.setObjectNotExistsAsync(`${accountFolder}.info.deviceCount`, {
					type: 'state',
					common: {
						name: 'Device Count',
						type: 'number',
						role: 'value',
						read: true,
						write: false,
					},
					native: {},
				});
				await this.setState(`${accountFolder}.info.deviceCount`, {
					val: comprehensiveData.devices?.length || 0,
					ack: true,
				});

				// Store raw comprehensive data as JSON for debugging
				await this.setObjectNotExistsAsync(`${accountFolder}.info.rawData`, {
					type: 'state',
					common: {
						name: 'Raw Comprehensive Data',
						type: 'string',
						role: 'json',
						read: true,
						write: false,
					},
					native: {},
				});
				await this.setState(`${accountFolder}.info.rawData`, {
					val: JSON.stringify(comprehensiveData),
					ack: true,
				});

				// Update last update timestamp after initial price fetch
				await this.setState(`${accountFolder}.lastUpdate`, {
					val: new Date().toISOString(),
					ack: true,
				});

				// Fetch devices
				const devices = await this.apiClient.getDevices(account.accountNumber);
				this.log.debug(`Found ${devices.length} device(s) for account ${account.accountNumber}`);

				// Process devices
				for (const device of devices) {
					const deviceFolder = `${accountFolder}.devices.${device.krakenflexDeviceId || device.id}`;

					await this.setObjectNotExistsAsync(deviceFolder, {
						type: 'folder',
						common: {
							name: `${device.vehicleMake || 'Device'} ${device.vehicleModel || ''}`.trim(),
						},
						native: {},
					});

					// Set device states
					if (device.status) {
						await this.setObjectNotExistsAsync(`${deviceFolder}.currentState`, {
							type: 'state',
							common: {
								name: 'Current State',
								type: 'string',
								role: 'text',
								read: true,
								write: false,
							},
							native: {},
						});
						await this.setState(`${deviceFolder}.currentState`, {
							val: device.status.currentState,
							ack: true,
						});

						await this.setObjectNotExistsAsync(`${deviceFolder}.isConnected`, {
							type: 'state',
							common: {
								name: 'Is Connected',
								type: 'boolean',
								role: 'indicator.connected',
								read: true,
								write: false,
							},
							native: {},
						});
						await this.setState(`${deviceFolder}.isConnected`, {
							val: device.status.isConnected,
							ack: true,
						});

						if (device.status.currentBatteryLevel !== undefined) {
							await this.setObjectNotExistsAsync(`${deviceFolder}.batteryLevel`, {
								type: 'state',
								common: {
									name: 'Battery Level',
									type: 'number',
									role: 'value.battery',
									unit: '%',
									read: true,
									write: false,
								},
								native: {},
							});
							await this.setState(`${deviceFolder}.batteryLevel`, {
								val: device.status.currentBatteryLevel,
								ack: true,
							});
						}
					}
				}

				// Fetch planned dispatches
				const plannedDispatches = await this.apiClient.getPlannedDispatches(account.accountNumber);
				this.log.debug(
					`Found ${plannedDispatches.length} planned dispatch(es) for account ${account.accountNumber}`,
				);

				// Store planned dispatches as JSON
				await this.setObjectNotExistsAsync(`${accountFolder}.dispatches.planned.data`, {
					type: 'state',
					common: {
						name: 'Planned Dispatches Data',
						type: 'string',
						role: 'json',
						read: true,
						write: false,
					},
					native: {},
				});
				await this.setState(`${accountFolder}.dispatches.planned.data`, {
					val: JSON.stringify(plannedDispatches),
					ack: true,
				});

				// Fetch today's completed dispatches
				const today = new Date().toISOString().split('T')[0];
				const completedDispatches = await this.apiClient.getCompletedDispatches(account.accountNumber, today);
				this.log.debug(
					`Found ${completedDispatches.length} completed dispatch(es) for account ${account.accountNumber}`,
				);

				// Store completed dispatches as JSON
				await this.setObjectNotExistsAsync(`${accountFolder}.dispatches.completed.data`, {
					type: 'state',
					common: {
						name: 'Completed Dispatches Data',
						type: 'string',
						role: 'json',
						read: true,
						write: false,
					},
					native: {},
				});
				await this.setState(`${accountFolder}.dispatches.completed.data`, {
					val: JSON.stringify(completedDispatches),
					ack: true,
				});

				// Fetch smart meter readings for each property
				for (const property of account.properties) {
					const propertyFolder = `${accountFolder}.property_${property.id}`;

					try {
						const readings = await this.apiClient.getSmartMeterReadings(
							account.accountNumber,
							property.id,
							today,
						);

						this.log.debug(`Found ${readings.length} meter reading(s) for property ${property.id}`);

						// Store readings as JSON
						await this.setObjectNotExistsAsync(`${propertyFolder}.electricity.readings`, {
							type: 'state',
							common: {
								name: 'Meter Readings',
								type: 'string',
								role: 'json',
								read: true,
								write: false,
							},
							native: {},
						});
						await this.setState(`${propertyFolder}.electricity.readings`, {
							val: JSON.stringify(readings),
							ack: true,
						});
					} catch (error: any) {
						this.log.warn(`Failed to fetch meter readings for property ${property.id}: ${error.message}`);
					}
				}
			} catch (error: any) {
				this.log.error(`Failed to fetch data for account ${account.accountNumber}: ${error.message}`);
			}
		}
	}

	/**
	 * Schedule meter readings updates at 0, 15, 30, 45 minutes of every hour
	 */
	private scheduleMeterReadingsUpdates(): void {
		// Cron pattern: at minute 0, 15, 30, and 45
		const cronPattern = '0,15,30,45 * * * *';

		this.log.info(
			'Scheduling meter readings updates at 0, 15, 30, and 45 minutes of every hour (with random delay)',
		);

		// Create cron job for readings
		this.readingsUpdateCron = schedule(
			cronPattern,
			() => {
				// Add random delay of 0-5 minutes (0-300000 ms) to avoid API overload
				const randomDelay = Math.floor(Math.random() * 300000);
				const delayMinutes = (randomDelay / 60000).toFixed(1);

				this.log.debug(`Meter readings update triggered, waiting ${delayMinutes} minutes before execution`);

				setTimeout(() => {
					this.updateMeterReadings();
				}, randomDelay);
			},
			{
				timezone: 'Europe/Berlin', // Use German timezone for Octopus Energy Germany
			},
		);

		// Start the cron job
		this.readingsUpdateCron.start();
	}

	/**
	 * Schedule daily updates for everything else (balance, rates, etc.) after midnight
	 */
	private scheduleDailyUpdates(): void {
		// Cron pattern: at midnight every day
		const cronPattern = '0 0 * * *';

		this.log.info('Scheduling daily comprehensive updates at midnight (with 0-15 min random delay)');

		// Create cron job for daily updates
		this.dailyUpdateCron = schedule(
			cronPattern,
			() => {
				// Add random delay of 0-15 minutes (0-900000 ms) to avoid API overload
				const randomDelay = Math.floor(Math.random() * 900000);
				const delayMinutes = (randomDelay / 60000).toFixed(1);

				this.log.debug(`Daily update triggered at midnight, waiting ${delayMinutes} minutes before execution`);

				setTimeout(() => {
					this.updateComprehensiveData();
				}, randomDelay);
			},
			{
				timezone: 'Europe/Berlin', // Use German timezone for Octopus Energy Germany
			},
		);

		// Start the cron job
		this.dailyUpdateCron.start();

		// Also run an initial update after a short delay
		const initialDelay = 5000 + Math.floor(Math.random() * 10000); // 5-15 seconds
		setTimeout(() => {
			this.log.info('Running initial comprehensive data update');
			this.updateComprehensiveData();
		}, initialDelay);
	}

	/**
	 * Update only meter readings for all accounts (runs every 15 minutes)
	 */
	private async updateMeterReadings(): Promise<void> {
		if (!this.apiClient) {
			this.log.warn('API client not initialized, skipping meter readings update');
			return;
		}

		this.log.info('Updating meter readings...');

		for (const account of this.accounts) {
			try {
				const accountFolder = `account_${account.accountNumber}`;
				const today = new Date().toISOString().split('T')[0];

				// Fetch comprehensive data to get property structure
				const comprehensiveData = await this.apiClient.getComprehensiveData(account.accountNumber);

				if (comprehensiveData?.account?.allProperties) {
					for (const property of comprehensiveData.account.allProperties) {
						const propertyFolder = `${accountFolder}.property_${property.id}`;

						// Update smart meter readings (30-minute intervals)
						try {
							const readings = await this.apiClient.getSmartMeterReadings(
								account.accountNumber,
								property.id,
								today,
							);

							if (readings.length > 0) {
								await this.setState(`${propertyFolder}.electricity.readings`, {
									val: JSON.stringify(readings),
									ack: true,
								});
								this.log.debug(
									`Updated ${readings.length} smart meter readings for property ${property.id}`,
								);
							}
						} catch (error: any) {
							this.log.debug(
								`Failed to fetch smart meter readings for property ${property.id}: ${error.message}`,
							);
						}
					}
				}

				this.log.info(`Successfully updated meter readings for account ${account.accountNumber}`);
			} catch (error: any) {
				this.log.error(
					`Failed to update meter readings for account ${account.accountNumber}: ${error.message}`,
				);
			}
		}
	}

	/**
	 * Update comprehensive data including balance, rates, and device info (runs once daily)
	 */
	private async updateComprehensiveData(): Promise<void> {
		if (!this.apiClient) {
			this.log.warn('API client not initialized, skipping comprehensive update');
			return;
		}

		this.log.info('Updating comprehensive data (balance, rates, devices)...');

		for (const account of this.accounts) {
			try {
				const accountFolder = `account_${account.accountNumber}`;

				// Fetch updated comprehensive data
				const comprehensiveData = await this.apiClient.getComprehensiveData(account.accountNumber);

				if (comprehensiveData?.account) {
					const accountData = comprehensiveData.account;

					// Update balance
					const electricityLedger = accountData.ledgers?.find(
						(l: any) => l.ledgerType === 'ELECTRICITY_LEDGER',
					);
					if (electricityLedger) {
						await this.setState(`${accountFolder}.balance`, {
							val: electricityLedger.balance || 0,
							ack: true,
						});
					}

					// Update all ledger balances in info
					if (accountData.ledgers) {
						for (const ledger of accountData.ledgers) {
							const ledgerType = ledger.ledgerType?.toLowerCase().replace('_ledger', '') || 'unknown';
							await this.setState(`${accountFolder}.info.${ledgerType}Balance`, {
								val: ledger.balance || 0,
								ack: true,
							});
						}
					}

					// Update rates for each property
					if (accountData.allProperties) {
						for (const property of accountData.allProperties) {
							const propertyFolder = `${accountFolder}.property_${property.id}`;

							// Update electricity rates
							if (property.electricityMalos?.length > 0) {
								for (const malo of property.electricityMalos) {
									const maloFolder = `${propertyFolder}.electricity.malo_${malo.maloNumber}`;

									if (malo.agreements?.length > 0) {
										const currentAgreement = malo.agreements[0];
										const agreementFolder = `${maloFolder}.currentAgreement`;

										// Update unit rate information
										if (currentAgreement.unitRateInformation) {
											const rateInfo = currentAgreement.unitRateInformation;

											if (
												rateInfo.__typename === 'SimpleProductUnitRateInformation' &&
												rateInfo.latestGrossUnitRateCentsPerKwh !== undefined
											) {
												// Update simple rate
												await this.setState(`${agreementFolder}.currentRate`, {
													val: rateInfo.latestGrossUnitRateCentsPerKwh / 100,
													ack: true,
												});
												this.log.debug(
													`Updated electricity rate for ${malo.maloNumber}: ${(
														rateInfo.latestGrossUnitRateCentsPerKwh / 100
													).toFixed(2)} ct/kWh`,
												);
											} else if (
												rateInfo.__typename === 'TimeOfUseProductUnitRateInformation' &&
												rateInfo.rates
											) {
												// Update time of use rates
												const ratesFolder = `${agreementFolder}.timeOfUseRates`;
												for (const rate of rateInfo.rates) {
													const slotName = rate.timeslotName || 'unknown';
													const slotFolder = `${ratesFolder}.${slotName
														.toLowerCase()
														.replace(/\s+/g, '_')}`;

													if (rate.latestGrossUnitRateCentsPerKwh !== undefined) {
														await this.setState(`${slotFolder}.rate`, {
															val: rate.latestGrossUnitRateCentsPerKwh / 100,
															ack: true,
														});
														this.log.debug(
															`Updated ${slotName} rate: ${(
																rate.latestGrossUnitRateCentsPerKwh / 100
															).toFixed(2)} ct/kWh`,
														);
													}
												}
											}
										}
									}
								}
							}

							// Update gas rates similarly
							if (property.gasMalos?.length > 0) {
								for (const malo of property.gasMalos) {
									const maloFolder = `${propertyFolder}.gas.malo_${malo.maloNumber}`;

									if (malo.agreements?.length > 0) {
										const currentAgreement = malo.agreements[0];
										const agreementFolder = `${maloFolder}.currentAgreement`;

										if (
											currentAgreement.unitRateInformation?.__typename ===
												'SimpleProductUnitRateInformation' &&
											currentAgreement.unitRateInformation.latestGrossUnitRateCentsPerKwh !==
												undefined
										) {
											await this.setState(`${agreementFolder}.currentRate`, {
												val:
													currentAgreement.unitRateInformation
														.latestGrossUnitRateCentsPerKwh / 100,
												ack: true,
											});
											this.log.debug(
												`Updated gas rate for ${malo.maloNumber}: ${(
													currentAgreement.unitRateInformation
														.latestGrossUnitRateCentsPerKwh / 100
												).toFixed(2)} ct/kWh`,
											);
										}
									}
								}
							}
						}
					}

					// Update device count
					await this.setState(`${accountFolder}.info.deviceCount`, {
						val: comprehensiveData.devices?.length || 0,
						ack: true,
					});

					// Update raw data
					await this.setState(`${accountFolder}.info.rawData`, {
						val: JSON.stringify(comprehensiveData),
						ack: true,
					});

					// Update last update timestamp
					await this.setState(`${accountFolder}.lastUpdate`, {
						val: new Date().toISOString(),
						ack: true,
					});
				}

				this.log.info(`Successfully updated comprehensive data for account ${account.accountNumber}`);
			} catch (error: any) {
				this.log.error(
					`Failed to update comprehensive data for account ${account.accountNumber}: ${error.message}`,
				);
			}
		}
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new OctopusEnergy(options);
} else {
	// otherwise start the instance directly
	(() => new OctopusEnergy())();
}
