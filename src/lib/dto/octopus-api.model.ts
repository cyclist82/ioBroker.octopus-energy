export interface OctopusConfig {
	email: string;
	password: string;
}

export interface KrakenToken {
	token: string;
	payload: {
		exp: number;
		sub: string;
	};
}

export interface Account {
	accountNumber: string;
	balance: number;
	properties: Property[];
}

export interface Property {
	id: string;
	address?: string;
	occupancyPeriods?: Array<{
		effectiveFrom: string;
		effectiveTo?: string;
	}>;
	electricityMeterPoints?: ElectricityMeterPoint[];
	gasMeterPoints?: GasMeterPoint[];
}

export interface ElectricityMeterPoint {
	id: string;
	mpan?: string;
	profileClass?: string;
	consumptionStandard?: number;
	meters?: Meter[];
	agreements?: Agreement[];
}

export interface GasMeterPoint {
	id: string;
	mprn?: string;
	consumptionStandard?: number;
	meters?: Meter[];
	agreements?: Agreement[];
}

export interface Meter {
	id: string;
	serialNumber?: string;
	makeAndType?: string;
	createdAt?: string;
}

export interface Agreement {
	id: string;
	tariff?: Tariff;
	validFrom?: string;
	validTo?: string;
}

export interface Tariff {
	displayName?: string;
	fullName?: string;
	description?: string;
	productCode?: string;
	standingCharge?: number;
	preVatStandingCharge?: number;
}

export interface Device {
	id: string;
	deviceType: string;
	krakenflexDeviceId?: string;
	provider?: string;
	vehicleMake?: string;
	vehicleModel?: string;
	vehicleBatteryCapacityInKwh?: number;
	vehicleChargingRateInKw?: number;
	status?: {
		currentState: string;
		isConnected: boolean;
		currentBatteryLevel?: number;
	};
}

export interface PlannedDispatch {
	startDt: string;
	endDt: string;
	delta?: string;
	meta?: {
		source?: string;
		location?: string;
	};
}

export interface CompletedDispatch {
	startDt: string;
	endDt: string;
	delta?: string;
	meta?: {
		source?: string;
		location?: string;
	};
}

export interface MeterReading {
	startAt: string;
	endAt: string;
	value: number;
	unit: string;
}
