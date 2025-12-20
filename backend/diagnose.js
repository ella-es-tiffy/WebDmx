
const { SerialPort } = require('serialport');

const PORT_PATH = '/dev/cu.usbserial-132120';

console.log('=== DMX DIAGNOSTIC TOOL ===');
console.log('Target Port: ' + PORT_PATH);

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testBaudRate(baud) {
    console.log(`\nTesting Baudrate: ${baud}...`);

    return new Promise((resolve) => {
        const port = new SerialPort({
            path: PORT_PATH,
            baudRate: baud,
            dataBits: 8,
            stopBits: 2,
            parity: 'none'
        }, async (err) => {
            if (err) {
                console.log(`❌ Failed to open at ${baud}: ${err.message}`);
                resolve();
                return;
            }

            console.log(`✅ Port opened at ${baud}. Sending data...`);

            // Send a burst of data (trying to wake up the light)
            // If the baudrate is vaguely correct, the "DMX Signal" LED on the fixture might flicker
            const buffer = Buffer.alloc(513, 255); // All channels FULL ONO
            buffer[0] = 0; // Start code

            let count = 0;
            const interval = setInterval(() => {
                port.write(buffer);
                process.stdout.write('.');
                count++;
                if (count > 20) { // Send for ~2 seconds
                    clearInterval(interval);
                    port.close(() => {
                        console.log(' Done.');
                        resolve();
                    });
                }
            }, 50);
        });

        port.on('error', (err) => {
            console.log(`⚠️ Port Error: ${err.message}`);
        });
    });
}

(async () => {
    console.log('Starting Sweep...');

    // 1. The Real Deal (often fails on Mac without driver)
    await testBaudRate(250000);

    // 2. The Slow One (Classic Serial)
    await testBaudRate(57600);

    // 3. The Fast Ones
    await testBaudRate(115200);
    await testBaudRate(230400); // Close to 250k!

    // 4. The "Double Speed" trick
    await testBaudRate(500000);

    console.log('\n=== DIAGNOSIS COMPLETE ===');
    console.log('If the fixture LED never flickered, the driver is likely blocking RAW access.');
})();
