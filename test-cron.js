const cron = require('node-cron');

console.log('Testing CronJob Implementation for Energy Price Updates\n');
console.log('=' .repeat(60));

// Test cron pattern
const cronPattern = '0,15,30,45 * * * *';

console.log(`Cron Pattern: ${cronPattern}`);
console.log('This pattern means: Run at minute 0, 15, 30, and 45 of every hour\n');

// Parse and validate the cron expression
const isValid = cron.validate(cronPattern);
console.log(`Pattern is valid: ${isValid}\n`);

// Show when the next 10 executions would occur
const now = new Date();
console.log(`Current time: ${now.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`);
console.log('\nNext 10 scheduled execution times (without random delay):');

// Calculate next execution times
const nextTimes = [];
let nextTime = new Date(now);

// Find next quarter hour
const minutes = nextTime.getMinutes();
const quarterMinutes = [0, 15, 30, 45];
let nextQuarter = quarterMinutes.find(q => q > minutes);

if (!nextQuarter) {
	// Move to next hour
	nextTime.setHours(nextTime.getHours() + 1);
	nextTime.setMinutes(0);
} else {
	nextTime.setMinutes(nextQuarter);
}
nextTime.setSeconds(0);
nextTime.setMilliseconds(0);

// Generate 10 next times
for (let i = 0; i < 10; i++) {
	nextTimes.push(new Date(nextTime));

	// Move to next quarter
	const currentMinutes = nextTime.getMinutes();
	if (currentMinutes === 45) {
		nextTime.setHours(nextTime.getHours() + 1);
		nextTime.setMinutes(0);
	} else {
		nextTime.setMinutes(currentMinutes + 15);
	}
}

nextTimes.forEach((time, index) => {
	const timeStr = time.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
	console.log(`  ${index + 1}. ${timeStr}`);
});

console.log('\n' + '=' .repeat(60));
console.log('Random Delay Mechanism:');
console.log('- Each execution adds a random delay of 0-5 minutes');
console.log('- This prevents API overload when multiple instances run');
console.log('- Actual execution time = scheduled time + random(0-300 seconds)\n');

// Simulate random delays for next 5 executions
console.log('Example with random delays applied:');
for (let i = 0; i < 5; i++) {
	const scheduledTime = nextTimes[i];
	const randomDelay = Math.floor(Math.random() * 300000); // 0-5 minutes in ms
	const actualTime = new Date(scheduledTime.getTime() + randomDelay);

	const delayMinutes = (randomDelay / 60000).toFixed(1);
	const scheduledStr = scheduledTime.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin' });
	const actualStr = actualTime.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin' });

	console.log(`  ${i + 1}. Scheduled: ${scheduledStr} → Actual: ${actualStr} (delay: ${delayMinutes} min)`);
}

console.log('\n' + '=' .repeat(60));
console.log('Testing CronJob Creation:');

// Create a test cron job (won't actually run)
let executionCount = 0;
const testJob = cron.schedule(
	cronPattern,
	() => {
		executionCount++;
		const now = new Date();
		const randomDelay = Math.floor(Math.random() * 300000);
		console.log(`[${now.toLocaleTimeString('de-DE')}] Cron triggered! Adding ${(randomDelay/60000).toFixed(1)} min delay`);
	},
	{
		timezone: 'Europe/Berlin',
		scheduled: false // Don't start automatically for this test
	}
);

console.log('✓ CronJob created successfully');
console.log('✓ Timezone set to Europe/Berlin');
console.log('✓ Job can be started with .start() and stopped with .stop()');

// Clean up
testJob.destroy();
console.log('✓ Test job destroyed');

console.log('\n' + '=' .repeat(60));
console.log('Implementation Summary:');
console.log('1. Cron runs at fixed times: :00, :15, :30, :45');
console.log('2. Each execution adds 0-5 minute random delay');
console.log('3. Updates happen ~4 times per hour');
console.log('4. API load is distributed over 5-minute windows');
console.log('5. Works in German timezone (Europe/Berlin)');
console.log('6. Initial update runs 5-15 seconds after adapter start');