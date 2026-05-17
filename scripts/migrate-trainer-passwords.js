/**
 * One-shot migration: hash existing plaintext Trainer passwords.
 *
 * Context (SEV-C-005): Trainer passwords used to be stored in plain text. The
 * Trainer model now hashes with bcrypt (cost 12) and compares with bcrypt.
 * Existing trainer documents still contain plaintext values and MUST be
 * migrated, otherwise every trainer login will fail (bcrypt.compare against a
 * non-hash returns false).
 *
 * RUN THIS ONCE, immediately AFTER deploying the SEV-C-005 code change.
 *
 * Downtime / maintenance window: required. Run this during a window in which no
 * trainer is logging in or having their profile/password modified. A trainer
 * login that happens after deploy but before this migration completes will fail
 * until the migration finishes. The migration itself is brief.
 *
 * Idempotent: documents whose password is already a bcrypt hash
 * ($2a$/$2b$/$2y$) are skipped, so re-running after success is a safe no-op.
 *
 * Logging: only counts are logged. No plaintext value and no hash is ever
 * printed.
 *
 * Usage:
 *   node scripts/migrate-trainer-passwords.js
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../src/config/config');
const Trainer = require('../src/models/Trainer');

// A bcrypt hash starts with $2a$, $2b$ or $2y$. Anything else is plaintext.
const BCRYPT_PREFIX = /^\$2[aby]\$/;
const BCRYPT_COST = 12;

async function migrate() {
    let migrated = 0;
    let alreadyHashed = 0;
    let skippedEmpty = 0;
    let failed = 0;

    await mongoose.connect(config.mongodbUri);
    console.log('Connected. Scanning trainers...');

    // password is select:false on the model, so request it explicitly.
    const trainers = await Trainer.find({}).select('+password').lean();
    console.log(`Found ${trainers.length} trainer document(s).`);

    for (const trainer of trainers) {
        const pw = trainer.password;

        if (!pw || typeof pw !== 'string') {
            skippedEmpty += 1;
            continue;
        }

        if (BCRYPT_PREFIX.test(pw)) {
            alreadyHashed += 1;
            continue;
        }

        try {
            const hashed = await bcrypt.hash(pw, BCRYPT_COST);
            // Use updateOne (not doc.save()) so the model pre-save hook does
            // NOT run and double-hash the already-hashed value.
            await Trainer.updateOne(
                { _id: trainer._id },
                { $set: { password: hashed, updatedAt: new Date() } }
            );
            migrated += 1;
        } catch (err) {
            failed += 1;
            // Never log the password or hash - only the id and error message.
            console.error(`Failed to migrate trainer ${trainer._id}: ${err.message}`);
        }
    }

    console.log('--- Migration summary ---');
    console.log(`Total trainers:       ${trainers.length}`);
    console.log(`Newly migrated:       ${migrated}`);
    console.log(`Already hashed (skip): ${alreadyHashed}`);
    console.log(`Empty/invalid (skip):  ${skippedEmpty}`);
    console.log(`Failed:               ${failed}`);

    await mongoose.disconnect();
    console.log('Disconnected. Migration complete.');

    // Non-zero exit if any document failed, so CI/operators notice.
    process.exit(failed > 0 ? 1 : 0);
}

migrate().catch(async (err) => {
    console.error(`Migration aborted: ${err.message}`);
    try {
        await mongoose.disconnect();
    } catch (_) {
        // ignore disconnect errors during abort
    }
    process.exit(1);
});
