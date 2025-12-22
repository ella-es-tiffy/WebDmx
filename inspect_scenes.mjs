#!/usr/bin/env node

/**
 * Scene Inspector
 * Shows what channels are saved in each scene
 */

const API = 'http://localhost:3000';

async function inspectScenes() {
    try {
        const res = await fetch(`${API}/api/scenes`);
        const data = await res.json();

        if (!data.success || !data.scenes) {
            console.log('❌ No scenes found or API error');
            return;
        }

        console.log(`\n📋 Found ${data.scenes.length} scene(s):\n`);

        data.scenes.forEach((scene, idx) => {
            console.log(`${'='.repeat(60)}`);
            console.log(`Scene ${idx + 1}: "${scene.name}"`);
            console.log(`${'='.repeat(60)}`);
            console.log(`  ID:     ${scene.id}`);
            console.log(`  Color:  ${scene.color}`);
            console.log(`  Type:   ${scene.type}`);

            // Parse channel_data
            let channels = scene.channel_data;
            if (typeof channels === 'string') {
                try {
                    channels = JSON.parse(channels);
                } catch (e) {
                    console.log(`  ❌ Invalid channel data`);
                    return;
                }
            }

            const channelKeys = Object.keys(channels);
            console.log(`  Channels stored: ${channelKeys.length}`);

            if (channelKeys.length === 0) {
                console.log(`  ⚠️  WARNING: No channels saved!`);
            } else if (channelKeys.length > 0 && channelKeys.length < 10) {
                console.log(`  📝 Channel Summary:`);
                channelKeys.forEach(ch => {
                    console.log(`     CH ${ch}: ${channels[ch]}`);
                });
            } else {
                console.log(`  📝 First 10 channels:`);
                channelKeys.slice(0, 10).forEach(ch => {
                    console.log(`     CH ${ch}: ${channels[ch]}`);
                });
                console.log(`     ... and ${channelKeys.length - 10} more`);
            }

            // Check if it looks like filtered data
            const hasNonZero = channelKeys.some(ch => channels[ch] > 0);
            if (!hasNonZero) {
                console.log(`  ⚠️  All channels are 0 (possibly empty scene)`);
            }

            console.log('');
        });

        console.log(`\n✅ Inspection complete!\n`);

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

inspectScenes();
