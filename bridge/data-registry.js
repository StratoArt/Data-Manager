export const DATASETS = {
  crops: 'data/master/crops.json',

  pests: 'data/opt/hama.json',
  diseases: 'data/opt/penyakit.json',
  weeds: 'data/opt/gulma.json',

  products: 'data/products/pestisida.json',
  fertilizers: 'data/products/pupuk.json',

  activeIngredients: 'data/master/active_ingredients.json',
  moa: 'data/master/moa.json',

  relations: {
    cropHama: 'data/relations/crop_hama.json',
    cropPenyakit: 'data/relations/crop_penyakit.json',
    cropGulma: 'data/relations/crop_gulma.json',
    cropOPT: 'data/relations/crop_opt.json',
    productOPT: 'data/relations/product_opt.json',
    productCrop: 'data/relations/product_crop.json',
    aiMoa: 'data/relations/ai_moa.json'
  },

  assets: {
    icons: 'assets',
    optPhotos: 'assets/opt-media/photos',
    optReference: 'assets/opt-media/reference'
  }
};

export const DATA_CENTER = {
  name: 'Crop Expert Data Center',
  bridgeVersion: '0.1.0',
  schemaVersion: '1.0.0'
};
