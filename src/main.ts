import * as utils from '@iobroker/adapter-core';
import axios from 'axios';
import { KrakenTokenResponse } from './lib/dto';

class OctopusEnergy extends utils.Adapter {
	private token = '';
	private tokenExpiry: Date | null = null;
	private readonly apiUrl = 'https://api.oeg-kraken.energy/v1/graphql/';

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: 'octopus-energy',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on('objectChange', this.onObjectChange.bind(this));
		// this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	private async onReady(): Promise<void> {
		// Initialize your adapter here
		try {
			const { accountId } = this.config;
			// Get authentication token
			await this.getToken();
			console.log('TOKKEN', this.token);
			const properties = await this.getPropertyIds(accountId);
			console.log('PROPPS', properties);
			for (const propId of properties) {
				const prices = await this.getSmartMeterUsage(accountId, propId, '2025-09-25')
				console.log('PRICES', prices);
			}

		} catch (error: any) {
			this.log.error(`Failed to initialize adapter: ${error.message}`);
			throw error;
		}

		/*
		For every state in the system there has to be also an object of type state
		Here a simple template for a boolean variable named "testVariable"
		Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
		*/
		await this.setObjectNotExistsAsync('testVariable', {
			type: 'state',
			common: {
				name: 'testVariable',
				type: 'boolean',
				role: 'indicator',
				read: true,
				write: true,
			},
			native: {},
		});

		// In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
		this.subscribeStates('testVariable');
		// You can also add a subscription for multiple states. The following line watches all states starting with "lights."
		// this.subscribeStates('lights.*');
		// Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
		// this.subscribeStates('*');

		/*
			setState examples
			you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
		*/
		// the variable testVariable is set to true as command (ack=false)
		await this.setState('testVariable', true);

		// same thing, but the value is flagged "ack"
		// ack should be always set to true if the value is received from or acknowledged from the target system
		await this.setState('testVariable', { val: true, ack: true });

		// same thing, but the state is deleted after 30s (getState will return null afterwards)
		await this.setState('testVariable', { val: true, ack: true, expire: 30 });

		// examples for the checkPassword/checkGroup functions
		const checkPasswordResult = await this.checkPasswordAsync('admin', 'iobroker');
		this.log.info('check user admin pw iobroker: ' + checkPasswordResult);

		const checkGroupResult = await this.checkGroupAsync('admin', 'admin');
		this.log.info('check group user admin group admin: ' + checkGroupResult);
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 */
	private onUnload(callback: () => void): void {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			// clearInterval(interval1);

			callback();
		} catch (e) {
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

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  */
	// private onMessage(obj: ioBroker.Message): void {
	// 	if (typeof obj === 'object' && obj.message) {
	// 		if (obj.command === 'send') {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info('send command');

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
	// 		}
	// 	}
	// }

	/**
	 * Get authentication token with caching and retry logic
	 * @returns Promise<string> The authentication token
	 */
	private async getToken(): Promise<string> {
		// Check if we have a valid cached token
		if (this.token && this.tokenExpiry && this.tokenExpiry > new Date()) {
			return this.token;
		}

		// Validate configuration
		if (!(this.config.email && this.config.password)) {
			throw new Error('Email and password are not configured');
		}

		const mutation = `
			mutation krakenTokenAuthentication($email: String!, $password: String!) {
				obtainKrakenToken(input: { email: $email, password: $password }) {
					token
					payload
				}
			}
		`;
		const operationName = 'krakenTokenAuthentication';

		const variables = {
			email: this.config.email,
			password: this.config.password,
		};

		let lastError: Error | null = null;
		const maxRetries = 3;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				this.log.info(`Attempting to authenticate with Octopus Energy API (attempt ${attempt}/${maxRetries})`);

				const response = (await this.makeGraphQLRequest(
					mutation,
					variables,
					operationName,
				)) as KrakenTokenResponse;
				const token = response.obtainKrakenToken?.token;
				const expiry = response.obtainKrakenToken?.payload?.exp;
				if (token) {
					this.token = token;

					// Extract token expiry from payload
					if (expiry) {
						this.tokenExpiry = new Date(expiry * 1000); // Convert from Unix timestamp to Date
						this.log.info(`Token expires at: ${this.tokenExpiry.toISOString()}`);
					}

					this.log.info('Successfully authenticated with Octopus Energy API');
					return this.token;
				} else {
					throw new Error('Authentication failed: No token received');
				}
			} catch (error: any) {
				lastError = error;
				this.log.warn(`Authentication attempt ${attempt}/${maxRetries} failed: ${error.message}`);

				// If this isn't the last attempt, wait before retrying
				if (attempt < maxRetries) {
					const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff: 1s, 2s, 4s
					this.log.info(`Waiting ${delay}ms before retry...`);
					await new Promise((resolve) => setTimeout(resolve, delay));
				}
			}
		}

		// All retries failed
		this.log.error(`Failed to authenticate with Octopus Energy API after ${maxRetries} attempts`);
		throw new Error(`Authentication failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
	}

	/**
	 * Get smart meter usage data for energy prices
	 */
	private async getSmartMeterUsage(accountNumber: string, propertyId: string, date: string): Promise<any> {
		const query = `
			query getSmartMeterUsage($accountNumber: String!, $propertyId: ID!, $date: Date!) {
				account(accountNumber: $accountNumber) {
					property(id: $propertyId) {
						measurements(
							utilityFilters: {electricityFilters: {readingFrequencyType: RAW_INTERVAL, readingQuality: COMBINED}}
							startOn: $date
							first: 96
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
		`;

		const variables = {
			accountNumber,
			propertyId,
			date,
		};

		const operationName = 'getSmartMeterUsage';

		// Ensure we have a valid token
		await this.getToken();

		return await this.makeGraphQLRequest(query, variables, operationName, true);
	}

	/**
	 * Get property IDs for an account
	 */
	private async getPropertyIds(accountNumber: string): Promise<any> {
		console.log('ACCC', accountNumber)
		const query = `
			query getPropertyIds($accountNumber: String!) {
				account(accountNumber: $accountNumber) {
					properties {
						id
						occupancyPeriods {
							effectiveFrom
							effectiveTo
						}
					}
				}
			}
		`;

		const variables = {
			accountNumber,
		};

		const operationName = 'getPropertyIds';

		// Ensure we have a valid token
		await this.getToken();

		const response = await this.makeGraphQLRequest(query, variables, operationName, true);
		return response.account.properties.map(({ id }: { id: string }) => id);
	}

	/**
	 * Make HTTP request to GraphQL endpoint using Axios
	 */
	private async makeGraphQLRequest(
		query: string,
		variables: any = {},
		operationName: string,
		isAuthenticated: boolean = false,
	): Promise<any> {
		try {
			const response = await axios.post(
				this.apiUrl,
				{
					query,
					variables,
					operationName,
				},
				{
					headers: {
						'Content-Type': 'application/json',
						...(isAuthenticated && { Authorization: this.token }),
					},
				},
			);
			const result = response.data as any;
			if (result.errors) {
				throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
			}

			return result.data;
		} catch (error: any) {
			if (error.response) {
				// Server responded with error status
				throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
			} else if (error.request) {
				// Request was made but no response received
				throw new Error('No response received from server');
			} else {
				// Something else happened
				throw error;
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
