import { DATASETS, DATA_CENTER } from './data-registry.js';
import { loadJSON, clearDataCache } from './data-loader.js';

function records(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.records)) return data.records;
  return [];
}

function relationRows(data) {
  return Array.isArray(data)
    ? data
    : Array.isArray(data?.records)
      ? data.records
      : [];
}

function idOf(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function matches(row, keys, value) {
  const target = idOf(value);
  return keys.some(key => idOf(row?.[key]) === target);
}

async function loadDataset(path) {
  return loadJSON(path);
}

export const DataService = {

  async getCrops(options = {}) {
    return records(
      await loadDataset(DATASETS.crops, options)
    );
  },

  async getPests(options = {}) {
    return records(
      await loadDataset(DATASETS.pests, options)
    );
  },

  async getDiseases(options = {}) {
    return records(
      await loadDataset(DATASETS.diseases, options)
    );
  },

  async getWeeds(options = {}) {
    return records(
      await loadDataset(DATASETS.weeds, options)
    );
  },

  async getProducts(options = {}) {
    return records(
      await loadDataset(DATASETS.products, options)
    );
  },

  async getPesticides(options = {}) {
    return this.getProducts(options);
  },

  async getFertilizers(options = {}) {
    return records(
      await loadDataset(DATASETS.fertilizers, options)
    );
  },

  async getActiveIngredients(options = {}) {
    return records(
      await loadDataset(DATASETS.activeIngredients, options)
    );
  },

  async getMoA(options = {}) {
    return records(
      await loadDataset(DATASETS.moa, options)
    );
  },

  async getRelation(name, options = {}) {
    const path = DATASETS.relations?.[name];

    if (!path) {
      throw new Error(
        `Data Center: relation "${name}" tidak terdaftar`
      );
    }

    return relationRows(
      await loadDataset(path, options)
    );
  },

  async getCropOPT(cropId, options = {}) {
    const rows = await this.getRelation('cropOPT', options);

    return rows.filter(row =>
      matches(
        row,
        ['crop_id', 'cropId'],
        cropId
      )
    );
  },

  async getOPTActiveIngredients(optId, options = {}) {
    const rows = await this.getRelation('optAI', options);

    return rows.filter(row =>
      matches(
        row,
        ['opt_id', 'optId'],
        optId
      )
    );
  },

  async getOPTProducts(optId, options = {}) {
    const rows = await this.getRelation('productOPT', options);

    return rows.filter(row =>
      matches(
        row,
        ['opt_id', 'optId'],
        optId
      )
    );
  },

  async getProductOPT(productId, options = {}) {
    const rows = await this.getRelation('productOPT', options);

    return rows.filter(row =>
      matches(
        row,
        ['product_id', 'productId'],
        productId
      )
    );
  },

  async getProductCrop(productId, options = {}) {
    const rows = await this.getRelation('productCrop', options);

    return rows.filter(row =>
      matches(
        row,
        ['product_id', 'productId'],
        productId
      )
    );
  },

  async getProductActiveIngredients(productId, options = {}) {
    const products = await this.getProducts(options);

    const product = products.find(
      row => idOf(row?.id) === idOf(productId)
    );

    if (!product) return [];

    if (Array.isArray(product.active_ingredients)) {
      return product.active_ingredients;
    }

    if (Array.isArray(product.ai_master_matches)) {
      return product.ai_master_matches;
    }

    return [];
  },

  async getActiveIngredientMoA(aiId, options = {}) {
    const rows = await this.getRelation('aiMoa', options);

    return rows.filter(row =>
      matches(
        row,
        ['active_ingredient_id', 'activeIngredientId', 'ai_id', 'aiId'],
        aiId
      )
    );
  },

  async getOPTProfile(optId, options = {}) {

    const [
      pests,
      diseases,
      weeds
    ] = await Promise.all([
      this.getPests(options),
      this.getDiseases(options),
      this.getWeeds(options)
    ]);

    const all = [
      ...pests,
      ...diseases,
      ...weeds
    ];

    const opt = all.find(
      row => idOf(row?.id) === idOf(optId)
    );

    if (!opt) return null;

    const [
      aiRelations,
      productRelations
    ] = await Promise.all([
      this.getOPTActiveIngredients(optId, options),
      this.getOPTProducts(optId, options)
    ]);

    return {
      opt,
      activeIngredients: aiRelations,
      products: productRelations
    };
  },

  resolveMediaPath(path) {
    if (!path) return '';

    let value = String(path).trim();

    value = value.replace(
      /^assets\/opt\/photos\//,
      'assets/opt-media/photos/'
    );

    value = value.replace(
      /^assets\/opt\/reference\//,
      'assets/opt-media/reference/'
    );

    return (
      DATA_CENTER_BASE_URL.replace(/\/+$/, '') +
      '/' +
      value.replace(/^\/+/, '')
    );
  },

  getVersion() {
    return {
      name: DATA_CENTER.name,
      bridgeVersion: DATA_CENTER.bridgeVersion,
      schemaVersion: DATA_CENTER.schemaVersion
    };
  },

  clearCache() {
    clearDataCache();
  }
};

export default DataService;
