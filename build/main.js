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
var import_axios = __toESM(require("axios"));
class OctopusEnergy extends utils.Adapter {
  token = "";
  tokenExpiry = null;
  apiUrl = "https://api.oeg-kraken.energy/v1/graphql/";
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
      await this.getToken();
    } catch (error) {
      this.log.error(`Failed to initialize adapter: ${error.message}`);
      throw error;
    }
    await this.setObjectNotExistsAsync("testVariable", {
      type: "state",
      common: {
        name: "testVariable",
        type: "boolean",
        role: "indicator",
        read: true,
        write: true
      },
      native: {}
    });
    this.subscribeStates("testVariable");
    await this.setState("testVariable", true);
    await this.setState("testVariable", { val: true, ack: true });
    await this.setState("testVariable", { val: true, ack: true, expire: 30 });
    const checkPasswordResult = await this.checkPasswordAsync("admin", "iobroker");
    this.log.info("check user admin pw iobroker: " + checkPasswordResult);
    const checkGroupResult = await this.checkGroupAsync("admin", "admin");
    this.log.info("check group user admin group admin: " + checkGroupResult);
  }
  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   */
  onUnload(callback) {
    try {
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
  onStateChange(id, state) {
    if (state) {
      this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
    } else {
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
  async getToken() {
    var _a, _b, _c;
    if (this.token && this.tokenExpiry && this.tokenExpiry > /* @__PURE__ */ new Date()) {
      return this.token;
    }
    if (!(this.config.email && this.config.password)) {
      throw new Error("Email and password are not configured");
    }
    const mutation = `
			mutation krakenTokenAuthentication($email: String!, $password: String!) {
				obtainKrakenToken(input: { email: $email, password: $password }) {
					token
					payload
				}
			}
		`;
    const operationName = "krakenTokenAuthentication";
    const variables = {
      email: this.config.email,
      password: this.config.password
    };
    let lastError = null;
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.log.info(`Attempting to authenticate with Octopus Energy API (attempt ${attempt}/${maxRetries})`);
        const response = await this.makeGraphQLRequest(
          mutation,
          variables,
          operationName
        );
        const token = (_a = response.obtainKrakenToken) == null ? void 0 : _a.token;
        const expiry = (_c = (_b = response.obtainKrakenToken) == null ? void 0 : _b.payload) == null ? void 0 : _c.exp;
        if (token) {
          this.token = token;
          if (expiry) {
            this.tokenExpiry = new Date(expiry * 1e3);
            this.log.info(`Token expires at: ${this.tokenExpiry.toISOString()}`);
          }
          this.log.info("Successfully authenticated with Octopus Energy API");
          return this.token;
        } else {
          throw new Error("Authentication failed: No token received");
        }
      } catch (error) {
        lastError = error;
        this.log.warn(`Authentication attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1e3;
          this.log.info(`Waiting ${delay}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    this.log.error(`Failed to authenticate with Octopus Energy API after ${maxRetries} attempts`);
    throw new Error(`Authentication failed after ${maxRetries} attempts: ${(lastError == null ? void 0 : lastError.message) || "Unknown error"}`);
  }
  /**
   * Make HTTP request to GraphQL endpoint using Axios
   */
  async makeGraphQLRequest(query, variables = {}, operationName) {
    try {
      const response = await import_axios.default.post(
        this.apiUrl,
        {
          query,
          variables,
          operationName
        },
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
      const result = response.data;
      if (result.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
      }
      return result.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
      } else if (error.request) {
        throw new Error("No response received from server");
      } else {
        throw error;
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
