import axios, { AxiosInstance } from 'axios';
import { CompletedDispatch, Device, KrakenToken, MeterReading, OctopusConfig, PlannedDispatch } from './dto';
import { Account } from './dto/octopus-api.model';

export class OctopusApiClient {
	private readonly apiUrl = 'https://api.oeg-kraken.energy/v1/graphql/';
	private token = '';
	private tokenExpiry: Date | null = null;
	private axiosInstance: AxiosInstance;
	private config: OctopusConfig;

	constructor(config: OctopusConfig) {
		this.config = config;
		this.axiosInstance = axios.create({
			baseURL: this.apiUrl,
			timeout: 60000,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	}

	/**
	 * Authenticate with Octopus Energy API
	 */
	public async authenticate(): Promise<string> {
		// Check if we have a valid cached token
		if (this.token && this.tokenExpiry && this.tokenExpiry > new Date()) {
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
			password: this.config.password,
		};

		const response = await this.makeGraphQLRequest<{ obtainKrakenToken: KrakenToken }>(
			mutation,
			variables,
			'krakenTokenAuthentication',
		);
		const tokenData = response.obtainKrakenToken;
		if (!tokenData?.token) {
			throw new Error('Authentication failed: No token received');
		}

		this.token = tokenData.token;
		if (tokenData.payload?.exp) {
			this.tokenExpiry = new Date(tokenData.payload.exp * 1000);
		}

		return this.token;
	}

	/**
	 * Fetch all accounts for the authenticated user
	 */
	public async fetchAccounts(): Promise<Account[]> {
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

		const response = await this.makeGraphQLRequest<{ viewer: { accounts: Account[] } }>(
			query,
			{},
			'getAccounts',
			true,
		);
		return response.viewer?.accounts || [];
	}

	/**
	 * Get comprehensive data for a specific account
	 * Fetches account details, properties, rates, and devices
	 * Note: completedDispatches is fetched separately as it requires a device
	 */
	public async getComprehensiveData(accountNumber: string): Promise<any> {
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

		const response = await this.makeGraphQLRequest<any>(query, variables, 'ComprehensiveDataQuery', true);

		// Try to fetch completed dispatches separately (may fail if no device)
		let completedDispatches: any[] = [];
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
				const dispatchResponse = await this.makeGraphQLRequest<any>(
					dispatchQuery,
					variables,
					'CompletedDispatchesQuery',
					true,
				);
				completedDispatches = dispatchResponse.completedDispatches || [];
			} catch {
				// Ignore errors - device may not support dispatches
			}
		}

		return {
			account: response.account,
			devices: response.devices || [],
			completedDispatches,
		};
	}

	/**
	 * Legacy method for backward compatibility - uses comprehensive data query
	 */
	public async getAccountData(accountNumber: string): Promise<any> {
		// Use the comprehensive data query instead
		const comprehensiveData = await this.getComprehensiveData(accountNumber);
		// Map the comprehensive data to match the legacy format
		if (comprehensiveData?.account) {
			const account = comprehensiveData.account;
			const ledger = account.ledgers?.find((l: any) => l.ledgerType === 'ELECTRICITY_LEDGER');

			return {
				accountNumber,
				balance: ledger?.balance || 0,
				properties:
					account.allProperties?.map((property: any) => ({
						id: property.id,
						address: `Property ${property.id}`, // Address is not directly available in comprehensive query
						occupancyPeriods: [],
						electricityMeterPoints:
							property.electricityMalos?.map((malo: any) => ({
								id: malo.meter?.id,
								mpan: malo.meloNumber,
								meters: malo.meter
									? [
											{
												id: malo.meter.id,
												serialNumber: malo.meter.number,
												makeAndType: malo.meter.meterType,
											},
										]
									: [],
								agreements: malo.agreements || [],
							})) || [],
						gasMeterPoints:
							property.gasMalos?.map((malo: any) => ({
								id: malo.meter?.id,
								mprn: malo.meloNumber,
								meters: malo.meter
									? [
											{
												id: malo.meter.id,
												serialNumber: malo.meter.number,
												makeAndType: malo.meter.meterType,
											},
										]
									: [],
								agreements: malo.agreements || [],
							})) || [],
					})) || [],
			};
		}

		return null;
	}

	/**
	 * Get devices associated with an account
	 */
	public async getDevices(_accountNumber: string): Promise<Device[]> {
		// TODO: The smartFlexDevices field doesn't exist on AccountType in the current API
		// This method returns an empty array for now until the correct query is determined
		return [];
	}

	/**
	 * Get planned dispatches for an account
	 */
	public async getPlannedDispatches(_accountNumber: string): Promise<PlannedDispatch[]> {
		// TODO: The plannedDispatches query requires a device which is not available for this account
		// This method returns an empty array for now until devices are available
		return [];
	}

	/**
	 * Get completed dispatches for an account
	 */
	public async getCompletedDispatches(
		_accountNumber: string,
		_startDate: string,
		_endDate?: string,
	): Promise<CompletedDispatch[]> {
		// TODO: The completedDispatches query parameters are not clear from the API
		// This method returns an empty array for now until the correct query is determined
		return [];
	}

	/**
	 * Get electricity meter readings
	 */
	public async getElectricityMeterReadings(accountNumber: string, meterId: string): Promise<MeterReading | null> {
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
			meterId,
		};

		const response = await this.makeGraphQLRequest<any>(query, variables, 'ElectricityMeterReadings', true);

		if (response.electricityMeterReadings?.edges?.length > 0) {
			const reading = response.electricityMeterReadings.edges[0].node;
			return {
				startAt: reading.readAt,
				endAt: reading.readAt,
				value: reading.value,
				unit: 'kWh',
			};
		}
		return null;
	}

	/**
	 * Get gas meter readings
	 */
	public async getGasMeterReadings(accountNumber: string, meterId: string): Promise<MeterReading | null> {
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
			meterId,
		};

		const response = await this.makeGraphQLRequest<any>(query, variables, 'GasMeterReadings', true);

		if (response.gasMeterReadings?.edges?.length > 0) {
			const reading = response.gasMeterReadings.edges[0].node;
			return {
				startAt: reading.readAt,
				endAt: reading.readAt,
				value: reading.value,
				unit: 'm³',
			};
		}
		return null;
	}

	/**
	 * Get EPEX day ahead prices for a specific period
	 */
	public async getEpexPrices(
		accountNumber: string,
		propertyId: string,
		periodStart: string,
		periodEnd: string,
	): Promise<any> {
		await this.authenticate();

		const query = `
			query ElectricityPriceDevelopment($accountNumber: String!, $propertyId: ID!, $periodStart: DateTime!, $periodEnd: DateTime!) {
				account(accountNumber: $accountNumber) {
					property(id: $propertyId) {
						electricityMalos {
							agreements {
								...unitRateForecastFields
								...currentAgreement
								product {
									code
								}
							}
						}
					}
				}
				epexDayAheadPrices(periodStart: $periodStart, periodEnd: $periodEnd, first: 96) {
					...epexDayAheadPrices
				}
			}

			fragment unitRateForecastFields on Agreement {
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
			}

			fragment currentAgreement on Agreement {
				...agreementStatus
				isTerminated
			}

			fragment agreementStatus on Agreement {
				isActive
				validFrom
				validTo
				isRevoked
			}

			fragment epexDayAheadPrices on EpexDayAheadPriceConnectionTypeConnection {
				edges {
					cursor
					node {
						periodStart
						periodEnd
						value
					}
				}
			}
		`;

		const variables = {
			accountNumber,
			propertyId,
			periodStart,
			periodEnd,
		};

		const response = await this.makeGraphQLRequest<any>(query, variables, 'ElectricityPriceDevelopment', true);
		return response;
	}

	/**
	 * Legacy method - Get smart meter readings for a property
	 */
	public async getSmartMeterReadings(
		accountNumber: string,
		propertyId: string,
		date: string,
		readingCount: number = 96,
	): Promise<MeterReading[]> {
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
			readingCount,
		};

		const response = await this.makeGraphQLRequest<{
			account: {
				property: {
					measurements: {
						edges: Array<{
							node: MeterReading;
						}>;
					};
				};
			};
		}>(query, variables, 'getSmartMeterReadings', true);

		return response.account?.property?.measurements?.edges?.map((edge) => edge.node) || [];
	}

	/**
	 * Make GraphQL request with error handling and retries
	 */
	private async makeGraphQLRequest<T>(
		query: string,
		variables: any = {},
		operationName: string,
		isAuthenticated: boolean = false,
		retryCount: number = 0,
	): Promise<T> {
		const maxRetries = 3;
		const headers: any = {
			'Content-Type': 'application/json',
		};

		if (isAuthenticated && this.token) {
			headers.Authorization = this.token;
		}

		try {
			const response = await this.axiosInstance.post(
				'',
				{
					query,
					variables,
					operationName,
				},
				{ headers },
			);

			const result = response.data;

			if (result.errors) {
				// Check for rate limiting error
				const rateLimitError = result.errors.find((e: any) => e.extensions?.errorCode === 'KT-CT-1199');
				if (rateLimitError && retryCount < maxRetries) {
					// Exponential backoff
					const delay = Math.pow(2, retryCount) * 1000;
					await new Promise((resolve) => setTimeout(resolve, delay));
					return this.makeGraphQLRequest<T>(query, variables, operationName, isAuthenticated, retryCount + 1);
				}

				throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
			}

			return result.data as T;
		} catch (error: any) {
			if (error.response?.status === 401 && isAuthenticated && retryCount === 0) {
				// Token might be expired, try to re-authenticate
				this.token = '';
				this.tokenExpiry = null;
				await this.authenticate();
				return this.makeGraphQLRequest<T>(query, variables, operationName, isAuthenticated, 1);
			}

			if (error.response?.status === 429 && retryCount < maxRetries) {
				// Rate limited, retry with exponential backoff
				const delay = Math.pow(2, retryCount) * 1000;
				await new Promise((resolve) => setTimeout(resolve, delay));
				return this.makeGraphQLRequest<T>(query, variables, operationName, isAuthenticated, retryCount + 1);
			}

			throw error;
		}
	}
}
