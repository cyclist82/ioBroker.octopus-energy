![Logo](admin/octopus-energy.png)

# ioBroker.octopus-energy

[![NPM version](https://img.shields.io/npm/v/iobroker.octopus-energy.svg)](https://www.npmjs.com/package/iobroker.octopus-energy)
[![Downloads](https://img.shields.io/npm/dm/iobroker.octopus-energy.svg)](https://www.npmjs.com/package/iobroker.octopus-energy)
![Number of Installations](https://iobroker.live/badges/octopus-energy-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/octopus-energy-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.octopus-energy.png?downloads=true)](https://nodei.co/npm/iobroker.octopus-energy/)

**Tests:** ![Test and Release](https://github.com/cyclist82/ioBroker.octopus-energy/workflows/Test%20and%20Release/badge.svg)

## Octopus Energy Germany adapter for ioBroker

This adapter connects to the Octopus Energy Germany API to integrate your energy data into your ioBroker smart home / home automation system. Access real-time pricing, consumption data, and manage your energy usage more efficiently.

## Overview

The Octopus Energy adapter for ioBroker enables you to:

- 📊 Monitor your current account balance and energy consumption
- 💡 Access real-time electricity and gas tariff rates
- ⚡ View time-of-use rates for dynamic tariffs like Agile Octopus
- 📈 Track historical consumption data from smart meters
- 🔌 Monitor and control smart devices (when available)
- 🏠 Integrate energy data into your home automation scenarios

## Prerequisites

To use this adapter, you need:

- An active Octopus Energy Germany account
- Your Octopus Energy login credentials (email and password)
- ioBroker installation (version 5.0.0 or higher recommended)

### Not yet an Octopus Energy customer?

If you're considering switching to Octopus Energy Germany, you can use this referral link to get started:

🎁 **[Join Octopus Energy with our referral link](https://share.octopusenergy.de/frosty-car-615)**

Both you and the referrer will benefit from special bonuses when you sign up using this link.

## Installation

1. Open your ioBroker admin interface
2. Navigate to the adapter tab
3. Search for "octopus-energy"
4. Click on the install button for the Octopus Energy adapter
5. Create a new instance of the adapter
6. Configure your credentials in the adapter settings

## Configuration

After installation, you need to configure the adapter:

1. **Email**: Enter your Octopus Energy account email address
2. **Password**: Enter your Octopus Energy account password

The adapter will automatically authenticate and fetch your account data when started.

## Data Structure

The adapter creates the following object structure in ioBroker:

```
octopus-energy.0
└── account_<ACCOUNT_NUMBER>
    ├── balance                    # Current account balance in EUR
    ├── info
    │   ├── accountId              # Unique account identifier
    │   ├── electricityBalance     # Electricity ledger balance
    │   ├── gasBalance            # Gas ledger balance (if applicable)
    │   ├── deviceCount           # Number of smart devices
    │   └── rawData               # Complete API response as JSON
    └── property_<PROPERTY_ID>
        ├── address               # Property address
        ├── electricity
        │   └── malo_<MALO_NUMBER>
        │       ├── mpan          # Meter Point Administration Number
        │       ├── referenceConsumption  # Annual reference consumption
        │       └── currentAgreement
        │           ├── productCode       # Tariff product code
        │           ├── productName       # Tariff product name
        │           ├── isTimeOfUse      # Dynamic pricing indicator
        │           ├── currentRate       # Current rate (ct/kWh)
        │           └── timeOfUseRates   # Time-based rates (if applicable)
        │               └── <TIME_SLOT>
        │                   ├── rate      # Rate for this time slot
        │                   ├── activeFrom # Start time
        │                   └── activeTo   # End time
        └── gas
            └── malo_<MALO_NUMBER>
                ├── mprn          # Meter Point Reference Number
                └── currentAgreement
                    └── ...       # Similar structure as electricity
```

## Available Data Points

### Account Information

- **balance**: Current account balance in EUR
- **accountId**: Unique identifier for your Octopus Energy account
- **electricityBalance**: Balance for electricity consumption
- **gasBalance**: Balance for gas consumption (if applicable)
- **deviceCount**: Number of connected smart devices

### Property Information

- **address**: Physical address of the property
- **mpan/mprn**: Unique meter point identifiers

### Tariff Information

- **productCode**: Your current tariff code (e.g., "AGILE-FLEX-22-11-25")
- **productName**: Human-readable tariff name
- **isTimeOfUse**: Boolean indicating if you have a dynamic tariff
- **currentRate**: Current electricity/gas rate in cents per kWh

### Time-of-Use Rates (Dynamic Tariffs)

For customers on dynamic tariffs like Agile Octopus:

- **rate**: Price per kWh for specific time periods
- **activeFrom/activeTo**: Time windows for each rate

## Usage Examples

### Example 1: Display Current Electricity Rate

Create a visualization showing your current electricity rate:

```javascript
// Get current rate
const currentRate = getState(
	'octopus-energy.0.account_A-XXX.property_XXX.electricity.malo_XXX.currentAgreement.currentRate',
).val;
console.log(`Current rate: ${currentRate} ct/kWh`);
```

### Example 2: Automation Based on Low Rates

Automatically start high-consumption devices when electricity is cheapest:

```javascript
// Check if rate is below threshold
on(
	{ id: 'octopus-energy.0.account_*.property_*.electricity.*.currentAgreement.currentRate', change: 'ne' },
	function (obj) {
		const rate = obj.state.val;
		const threshold = 20; // cents per kWh

		if (rate < threshold) {
			// Start washing machine, charge EV, etc.
			setState('washing-machine.start', true);
		}
	},
);
```

### Example 3: Monitor Account Balance

Send notification when account balance is low:

```javascript
on({ id: 'octopus-energy.0.account_*.balance', change: 'ne' }, function (obj) {
	const balance = obj.state.val;
	if (balance < 50) {
		sendTo('telegram', 'Your Octopus Energy balance is low: €' + balance);
	}
});
```

## Features

### Real-Time Pricing

Access current and forecast electricity rates, essential for optimizing consumption with dynamic tariffs.

### Smart Meter Integration

For customers with smart meters, the adapter provides detailed consumption data and patterns.

### Multi-Property Support

Manage multiple properties under one account, each with their own meters and tariffs.

### Comprehensive Tariff Details

Full visibility of your tariff structure including:

- Standing charges
- Unit rates
- Time-of-use variations
- VAT information

## Troubleshooting

### Authentication Failed

- Verify your email and password are correct
- Ensure you're using Octopus Energy Germany credentials
- Check if your account is active and in good standing

### No Data Retrieved

- Check your internet connection
- Verify the adapter is running (green light in admin interface)
- Review the adapter log for error messages

### Missing Properties or Meters

- Ensure your account setup is complete on the Octopus Energy website
- Some data may take time to appear after account activation

## API Support

For API-related questions and integration details, consult the official Octopus Energy developer documentation:

- **REST API**: [https://developer.oeg-kraken.energy/](https://developer.oeg-kraken.energy/)
- **GraphQL API**: [https://developer.oeg-kraken.energy/graphql/](https://developer.oeg-kraken.energy/graphql/)

For client-specific issues, please check the adapter code and error messages for troubleshooting guidance.

## Support

For issues, questions, or feature requests:

- Check the [ioBroker forum](https://forum.iobroker.net/)
- Report bugs on [GitHub](https://github.com/cyclist82/ioBroker.octopus-energy/issues)

## Disclaimer

This adapter is not officially affiliated with or endorsed by Octopus Energy. It uses publicly available APIs to retrieve customer data. Use of this adapter is at your own risk.

## Privacy & Security

- Your credentials are stored locally in your ioBroker installation
- The adapter only connects directly to Octopus Energy servers
- No data is sent to third parties
- Use strong passwords and keep your ioBroker installation secure

## Changelog

<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->
### 0.0.3 (2025-09-28)

- (Leif Lampater) Added lastUpdate state to track when prices were last updated
- (Leif Lampater) Moved @iobroker/types to dependencies for proper runtime support

### 0.0.2 (2025-09-27)

- (Leif Lampater) Enhanced comprehensive data fetching with detailed tariff information
- (Leif Lampater) Added support for time-of-use rates and dynamic pricing
- (Leif Lampater) Implemented proper error handling and retry logic
- (Leif Lampater) Added info folder structure for better data organization
- (Leif Lampater) Initial release with basic account and property data

## License

MIT License

Copyright (c) 2025 Leif Lampater <leiflampater@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
