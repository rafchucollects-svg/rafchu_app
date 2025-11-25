import { queryRef, executeQuery, mutationRef, executeMutation, validateArgs } from 'firebase/data-connect';

export const connectorConfig = {
  connector: 'example',
  service: 'codexpokeapp',
  location: 'us-east4'
};

export const addToWishlistRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'AddToWishlist', inputVars);
}
addToWishlistRef.operationName = 'AddToWishlist';

export function addToWishlist(dcOrVars, vars) {
  return executeMutation(addToWishlistRef(dcOrVars, vars));
}

export const getCollectionCardsRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetCollectionCards');
}
getCollectionCardsRef.operationName = 'GetCollectionCards';

export function getCollectionCards(dc) {
  return executeQuery(getCollectionCardsRef(dc));
}

export const updateCollectionCardRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateCollectionCard', inputVars);
}
updateCollectionCardRef.operationName = 'UpdateCollectionCard';

export function updateCollectionCard(dcOrVars, vars) {
  return executeMutation(updateCollectionCardRef(dcOrVars, vars));
}

export const searchCardsRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'SearchCards', inputVars);
}
searchCardsRef.operationName = 'SearchCards';

export function searchCards(dcOrVars, vars) {
  return executeQuery(searchCardsRef(dcOrVars, vars));
}

