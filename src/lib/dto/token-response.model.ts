/**
 * Interface for the JWT payload
 */
export interface JWTPayload {
	sub: string;
	gty: string;
	email: string;
	tokenUse: string;
	iss: string;
	iat: number;
	exp: number;
	origIat: number;
}

/**
 * Interface for the Kraken token authentication response
 */
export interface KrakenTokenResponse {
	obtainKrakenToken: {
		token: string;
		payload: JWTPayload;
	};
}

/**
 * Interface for the GraphQL mutation variables
 */
export interface KrakenTokenVariables {
	email: string;
	password: string;
}
