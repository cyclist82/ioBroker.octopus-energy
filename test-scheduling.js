// Test script to verify the scheduling logic for energy price updates

// Simulate the scheduling logic
function testScheduling() {
	console.log('Testing Energy Price Update Scheduling\n');
	console.log('=' .repeat(50));

	// Current time
	const now = new Date();
	console.log(`Current time: ${now.toLocaleTimeString()}`);
	console.log(`Current minutes: ${now.getMinutes()}`);

	// Calculate next quarter hour
	const minutes = now.getMinutes();
	const seconds = now.getSeconds();
	const milliseconds = now.getMilliseconds();

	// Calculate next quarter hour (0, 15, 30, or 45 minutes)
	const minutesToNextQuarter = (15 - (minutes % 15)) % 15 || 15;
	const msToNextQuarter = (minutesToNextQuarter * 60 - seconds) * 1000 - milliseconds;

	console.log(`\nMinutes to next quarter hour: ${minutesToNextQuarter}`);
	console.log(`Milliseconds to next quarter: ${msToNextQuarter} (${(msToNextQuarter / 1000).toFixed(1)} seconds)`);

	// Add random delay
	const randomDelay = Math.floor(Math.random() * 300000); // 0-5 minutes
	const initialDelay = msToNextQuarter + randomDelay;

	console.log(`Random delay added: ${randomDelay} ms (${(randomDelay / 1000).toFixed(1)} seconds)`);
	console.log(`Total initial delay: ${initialDelay} ms (${(initialDelay / 1000).toFixed(1)} seconds)`);

	// Calculate when first update will happen
	const firstUpdate = new Date(now.getTime() + initialDelay);
	console.log(`\nFirst update will occur at: ${firstUpdate.toLocaleTimeString()}`);

	console.log('\n' + '=' .repeat(50));
	console.log('Schedule Pattern:');
	console.log('- Updates every 15 minutes (at :00, :15, :30, :45)');
	console.log('- Random delay of 0-5 minutes added to each update');
	console.log('- This prevents all instances from hitting the API simultaneously');

	// Show next 10 theoretical update times (without random delays)
	console.log('\nNext 10 quarter-hour marks:');
	let nextTime = new Date(now.getTime() + msToNextQuarter);
	for (let i = 0; i < 10; i++) {
		console.log(`  ${i + 1}. ${nextTime.toLocaleTimeString()}`);
		nextTime = new Date(nextTime.getTime() + 15 * 60 * 1000);
	}

	// Demonstrate random delay distribution
	console.log('\n' + '=' .repeat(50));
	console.log('Random Delay Distribution (10 samples):');
	for (let i = 0; i < 10; i++) {
		const delay = Math.floor(Math.random() * 300000);
		const minutes = Math.floor(delay / 60000);
		const seconds = Math.floor((delay % 60000) / 1000);
		console.log(`  Sample ${i + 1}: ${delay} ms (${minutes}m ${seconds}s)`);
	}

	console.log('\n' + '=' .repeat(50));
	console.log('Benefits of this approach:');
	console.log('✓ Regular updates aligned to quarter hours');
	console.log('✓ Random delay prevents API overload');
	console.log('✓ Each adapter instance has unique timing');
	console.log('✓ Balances API load over 5-minute window');
}

// Run the test
testScheduling();

// Simulate what happens during runtime
console.log('\n' + '=' .repeat(50));
console.log('Simulating Runtime Behavior:');
console.log('1. Adapter starts and calculates next quarter hour');
console.log('2. Adds random 0-5 minute delay');
console.log('3. Schedules first update');
console.log('4. After first update, schedules recurring updates every 15 minutes');
console.log('5. Each update has its own random 0-5 minute delay');
console.log('6. On adapter shutdown, all timers are cleared');

// Show configuration in ioBroker context
console.log('\n' + '=' .repeat(50));
console.log('Integration with ioBroker:');
console.log('- Updates run in background without user intervention');
console.log('- Energy prices automatically refresh 4 times per hour');
console.log('- Balance and rates stay current for automation rules');
console.log('- Log shows update status and any errors');
console.log('- Works with dynamic tariffs like Agile Octopus');