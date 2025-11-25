const { queryRef, executeQuery, mutationRef, executeMutation, validateArgs } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'example',
  service: 'codexpokeapp',
  location: 'us-east4'
};
exports.connectorConfig = connectorConfig;

const addToWishlistRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'AddToWishlist', inputVars);
}
addToWishlistRef.operationName = 'AddToWishlist';
exports.addToWishlistRef = addToWishlistRef;

exports.addToWishlist = function addToWishlist(dcOrVars, vars) {
  return executeMutation(addToWishlistRef(dcOrVars, vars));
};

const getCollectionCardsRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetCollectionCards');
}
getCollectionCardsRef.operationName = 'GetCollectionCards';
exports.getCollectionCardsRef = getCollectionCardsRef;

exports.getCollectionCards = function getCollectionCards(dc) {
  return executeQuery(getCollectionCardsRef(dc));
};

const updateCollectionCardRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateCollectionCard', inputVars);
}
updateCollectionCardRef.operationName = 'UpdateCollectionCard';
exports.updateCollectionCardRef = updateCollectionCardRef;

exports.updateCollectionCard = function updateCollectionCard(dcOrVars, vars) {
  return executeMutation(updateCollectionCardRef(dcOrVars, vars));
};

const searchCardsRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'SearchCards', inputVars);
}
searchCardsRef.operationName = 'SearchCards';
exports.searchCardsRef = searchCardsRef;

exports.searchCards = function searchCards(dcOrVars, vars) {
  return executeQuery(searchCardsRef(dcOrVars, vars));
};
