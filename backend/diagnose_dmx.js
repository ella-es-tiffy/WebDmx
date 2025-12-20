#!/usr/bin/env node

/**
 * DMX Hardware Diagnostic Tool
 * Tests various DMX transmission methods to find what works
 */

const { SerialPort } = require('serialport');

const PORT = '/dev/cu.usbserial-132120';
const BAUD = 250000;

console.log('🔍 DMX Hardware Diagnostic Tool\n');
console.log(`Port: ${PORT}`);
console.log(`Baud: ${BAUD}\n`);

const port = new SerialPort({
    path: PORT,
    baudRate: BAUD,
    dataBits: 8,
    stopBits: 2,
    parity: 'none'
});

port.on('open', async () => {
    console.log('✅ Port opened successfully\n');

    // Test Data: Channels 1-16 with pattern
    const testData = Buffer.alloc(513);
    testData[0] = 0x00; // Start Code
    testData[1] = 255;  // Ch1: PAN
    testData[6] = 255;  // Ch6: DIMMER
    testData[7] = 255;  // Ch7: SHUTTER
    testData[8] = 255;  // Ch8: RED

    console.log('📊 Test Pattern:');
    console.log('   Ch1 (PAN) = 255');
    console.log('   Ch6 (DIMMER) = 255');
    console.log('   Ch7 (SHUTTER) = 255');
    console.log('   Ch8 (RED) = 255\n');

    // METHOD 1: Hardware BREAK (current implementation)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧪 METHOD 1: Hardware BREAK (set brk)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await testMethod1(port, testData);
    await sleep(3000);

    // METHOD 2: Baud Rate Hack (alternative)
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧪 METHOD 2: Baud Rate Hack');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await testMethod2(port, testData);
    await sleep(3000);

    // METHOD 3: Direct Write (no BREAK)
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧪 METHOD 3: Direct Write (Control Test)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await testMethod3(port, testData);
    await sleep(3000);

    console.log('\n✨ Testing Complete!');
    console.log('\n❓ Which method made the lamp respond?');
    console.log('   If NONE worked, we have a hardware/wiring issue.');

    process.exit(0);
});

port.on('error', (err) => {
    console.error('❌ Port Error:', err.message);
    process.exit(1);
});

// ============================================
// METHOD 1: Hardware BREAK
// ============================================
async function testMethod1(port, data) {
    console.log('Sending 10 frames with hardware BREAK...\n');

    for (let i = 0; i < 10; i++) {
        await new Promise((resolve, reject) => {
            port.set({ brk: true }, (err) => {
                if (err) return reject(err);

                // BREAK duration
                setTimeout(() => {
                    port.set({ brk: false }, (err) => {
                        if (err) return reject(err);

                        // MAB + Data
                        setImmediate(() => {
                            port.write(data, (err) => {
                                if (err) return reject(err);
                                resolve();
                            });
                        });
                    });
                }, 0.1); // 100µs
            });
        });

        await sleep(30); // ~33Hz
        process.stdout.write(`Frame ${i + 1}/10\r`);
    }

    console.log('\n⏸️  Hold for 3 seconds - CHECK THE LAMP NOW!');
}

// ============================================
// METHOD 2: Baud Rate Hack
// ============================================
async function testMethod2(port, data) {
    console.log('Sending 10 frames with Baud Rate Hack...\n');

    for (let i = 0; i < 10; i++) {
        await new Promise((resolve, reject) => {
            // Switch to low baud for BREAK
            port.update({ baudRate: 45450 }, (err) => {
                if (err) return reject(err);

                // Send 0x00 as BREAK
                port.write(Buffer.from([0x00]), (err) => {
                    if (err) return reject(err);

                    // Switch back to 250k
                    port.update({ baudRate: 250000 }, (err) => {
                        if (err) return reject(err);

                        // Send data
                        port.write(data, (err) => {
                            if (err) return reject(err);
                            resolve();
                        });
                    });
                });
            });
        });

        await sleep(30);
        process.stdout.write(`Frame ${i + 1}/10\r`);
    }

    console.log('\n⏸️  Hold for 3 seconds - CHECK THE LAMP NOW!');
}

// ============================================
// METHOD 3: Direct Write (Control)
// ============================================
async function testMethod3(port, data) {
    console.log('Sending 10 frames with direct write (no BREAK)...\n');
    console.log('⚠️  This should NOT work (DMX requires BREAK)\n');

    for (let i = 0; i < 10; i++) {
        await new Promise((resolve, reject) => {
            port.write(data, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });

        await sleep(30);
        process.stdout.write(`Frame ${i + 1}/10\r`);
    }

    console.log('\n⏸️  Hold for 3 seconds - CHECK THE LAMP NOW!');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
