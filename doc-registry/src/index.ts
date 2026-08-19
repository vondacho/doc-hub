import type { Core } from '@strapi/strapi';

import { seedProducts } from './seed/products';

const PRODUCT_UID = 'api::product.product';

/** The two actions a reader needs, and nothing else. No create, update or delete. */
const PUBLIC_READ_ACTIONS = [`${PRODUCT_UID}.find`, `${PRODUCT_UID}.findOne`];

/**
 * Load the placeholder catalogue into an **empty** collection.
 *
 * "Empty" is the whole guard, and it is deliberately the only one: the seed is
 * a first-boot convenience, not a migration. Once anybody has registered,
 * renamed or deleted a product the collection is no longer empty and this does
 * nothing ever again — so a restart cannot resurrect an entry somebody removed,
 * and cannot overwrite one they edited.
 *
 * The PVC behind the database is what makes that stick across a redeploy. Wipe
 * the volume and the seed comes back, which is the honest behaviour: that is a
 * new registry, not the old one.
 */
async function seed(strapi: Core.Strapi): Promise<void> {
  if (!process.env.SEED_PRODUCTS || process.env.SEED_PRODUCTS === 'false') {
    strapi.log.info('[seed] SEED_PRODUCTS is not enabled — leaving the registry as it is.');
    return;
  }

  const existing = await strapi.db.query(PRODUCT_UID).count();
  if (existing > 0) {
    strapi.log.info(`[seed] ${existing} product(s) already registered — nothing to seed.`);
    return;
  }

  for (const product of seedProducts) {
    await strapi.documents(PRODUCT_UID).create({ data: product });
  }

  strapi.log.info(`[seed] registered ${seedProducts.length} placeholder product(s).`);
}

/**
 * Let an unauthenticated caller read the registry.
 *
 * doc-portal is a server-rendered page fetching the catalogue on every request;
 * handing it an API token would mean minting one by hand in the admin UI and
 * carrying it in a Secret, for data that is already public the moment the
 * portal renders it. Reads are opened, writes are not — registration still goes
 * through an authenticated call.
 *
 * Idempotent, and additive only: a permission that already exists is left
 * alone, including one an administrator turned *off* in the UI... which is why
 * the flag exists. Set PUBLIC_READ=false and this stops touching the role.
 */
async function openPublicRead(strapi: Core.Strapi): Promise<void> {
  if (process.env.PUBLIC_READ === 'false') return;

  const publicRole = await strapi.db
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'public' } });

  if (!publicRole) {
    strapi.log.warn('[permissions] no public role found — leaving the API closed.');
    return;
  }

  for (const action of PUBLIC_READ_ACTIONS) {
    const already = await strapi.db
      .query('plugin::users-permissions.permission')
      .findOne({ where: { action, role: publicRole.id } });

    if (already) continue;

    await strapi.db
      .query('plugin::users-permissions.permission')
      .create({ data: { action, role: publicRole.id } });

    strapi.log.info(`[permissions] granted "${action}" to the public role.`);
  }
}

export default {
  /**
   * Runs before the application is initialised. Nothing to extend here yet.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * Runs after the schema is migrated and before the server listens, which is
   * what makes both steps below safe: the products table exists, and no request
   * can arrive mid-seed.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await seed(strapi);
    await openPublicRead(strapi);
  },
};
