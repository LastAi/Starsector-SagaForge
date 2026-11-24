/**
 * Which Saga Forge this is, and which SagaLib it is made for. Kept equal to package.json's version and
 * to mods/SagaLib's mod_info.json by a test (test/appinfo.test.ts), so a release that bumps one fails
 * until the other follows.
 */
export const SAGA_FORGE_VERSION = '1.3.0'
/** The SagaLib this Saga Forge exports for and ships with (its newest features). */
export const SAGALIB_MADE_FOR = '1.4.0'
export const SAGALIB_MOD_ID = 'lastai_sagalib'
