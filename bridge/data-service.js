import { DATASETS, DATA_CENTER } from './data-registry.js';
import { loadJSON, clearDataCache } from './data-loader.js';

const get = (path, options) => loadJSON(path, options);

export const DataService = {

  // =========================
  // MASTER / OPT
  // =========================

  getCrops(options) {
    return get(DATASETS.crops, options);
  },

  getPests(options) {
    return get(DATASETS.pests, options);
  },

  getDiseases(options) {
    return get(DATASETS.diseases, options);
  },

  getWeeds(options) {
    return get(DATASETS.weeds, options);
  },

  // =========================
  // PRODUCTS
  // =========================

  getProducts(options) {
    return get(DATASETS.products, options);
  },

  // Compatibility alias
  getPesticides(options) {
    return get(DATASETS.products, options);
  },

  getFertilizers(options) {
    return get(DATASETS.fertilizers, options);
  },

  // =========================
  // ACTIVE INGREDIENT / MoA
  // =========================

  getActiveIngredients(options) {
    return get(DATASETS.activeIngredients, options);
  },

  getMoA(options) {
    return get(DATASETS.moa, options);
  },

  // =========================
  // RELATIONS
  // =========================

  getCropHama(options) {
    return get(DATASETS.relations.cropHama, options);
  },

  getCropPenyakit(options) {
    return get(DATASETS.relations.cropPenyakit, options);
  },

  getCropGulma(options) {
    return get(DATASETS.relations.cropGulma, options);
  },

  getCropOPT(options) {
    return get(DATASETS.relations.cropOPT, options);
  },

  getProductOPT(options) {
    return get(DATASETS.relations.productOPT, options);
  },

  getProductCrop(options) {
    return get(DATASETS.relations.productCrop, options);
  },

  getAIMoA(options) {
    return get(DATASETS.relations.aiMoa, options);
  },

  // =========================
  // MEDIA
  // =========================

  resolveMediaPath(path) {
    if (!path) return '';

    let value = String(path).trim();

    // Legacy OPT photo path → canonical Data Center path
    value = value.replace(
      /^assets\/opt\/photos\//,
      'assets/opt-media/photos/'
    );

    // Legacy OPT reference path → canonical Data Center path
    value = value.replace(
      /^assets\/opt\/reference\//,
      'assets/opt-media/reference/'
    );

    return value;
  },

  resolveMedia(item) {
    if (!item) return '';

    if (typeof item === 'string') {
      return this.resolveMediaPath(item);
    }

    if (item.local_path) {
      return this.resolveMediaPath(item.local_path);
    }

    if (item.remote_url) {
      return item.remote_url;
    }

    return '';
  },

  // =========================
  // DATA CENTER VERSION
  // =========================

  getVersion() {
    return {
      ...DATA_CENTER
    };
  },

  clearCache() {
    clearDataCache();
  }
};

export default DataService;
