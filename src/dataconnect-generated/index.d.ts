import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, MutationRef, MutationPromise } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface AddToWishlistData {
  wishlistItem_insert: WishlistItem_Key;
}

export interface AddToWishlistVariables {
  printingId: UUIDString;
}

export interface Card_Key {
  id: UUIDString;
  __typename?: 'Card_Key';
}

export interface CollectionCard_Key {
  id: UUIDString;
  __typename?: 'CollectionCard_Key';
}

export interface GetCollectionCardsData {
  collectionCards: ({
    id: UUIDString;
    printing?: {
      id: UUIDString;
      printingName: string;
      card?: {
        name: string;
        imageUrl: string;
      };
    } & Printing_Key;
      condition: string;
      grade?: string | null;
      isGraded?: boolean | null;
      purchaseDate?: DateString | null;
      purchasePrice?: number | null;
      quantity: number;
  } & CollectionCard_Key)[];
}

export interface PriceData_Key {
  id: UUIDString;
  __typename?: 'PriceData_Key';
}

export interface Printing_Key {
  id: UUIDString;
  __typename?: 'Printing_Key';
}

export interface SearchCardsData {
  cards: ({
    id: UUIDString;
    name: string;
    imageUrl: string;
    set: string;
  } & Card_Key)[];
}

export interface SearchCardsVariables {
  name: string;
}

export interface UpdateCollectionCardData {
  updatedCount: number;
}

export interface UpdateCollectionCardVariables {
  id: UUIDString;
  condition?: string | null;
  grade?: string | null;
  isGraded?: boolean | null;
  purchaseDate?: DateString | null;
  purchasePrice?: number | null;
  quantity?: number | null;
}

export interface User_Key {
  id: UUIDString;
  __typename?: 'User_Key';
}

export interface WishlistItem_Key {
  id: UUIDString;
  __typename?: 'WishlistItem_Key';
}

interface AddToWishlistRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: AddToWishlistVariables): MutationRef<AddToWishlistData, AddToWishlistVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: AddToWishlistVariables): MutationRef<AddToWishlistData, AddToWishlistVariables>;
  operationName: string;
}
export const addToWishlistRef: AddToWishlistRef;

export function addToWishlist(vars: AddToWishlistVariables): MutationPromise<AddToWishlistData, AddToWishlistVariables>;
export function addToWishlist(dc: DataConnect, vars: AddToWishlistVariables): MutationPromise<AddToWishlistData, AddToWishlistVariables>;

interface GetCollectionCardsRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetCollectionCardsData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<GetCollectionCardsData, undefined>;
  operationName: string;
}
export const getCollectionCardsRef: GetCollectionCardsRef;

export function getCollectionCards(): QueryPromise<GetCollectionCardsData, undefined>;
export function getCollectionCards(dc: DataConnect): QueryPromise<GetCollectionCardsData, undefined>;

interface UpdateCollectionCardRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateCollectionCardVariables): MutationRef<UpdateCollectionCardData, UpdateCollectionCardVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateCollectionCardVariables): MutationRef<UpdateCollectionCardData, UpdateCollectionCardVariables>;
  operationName: string;
}
export const updateCollectionCardRef: UpdateCollectionCardRef;

export function updateCollectionCard(vars: UpdateCollectionCardVariables): MutationPromise<UpdateCollectionCardData, UpdateCollectionCardVariables>;
export function updateCollectionCard(dc: DataConnect, vars: UpdateCollectionCardVariables): MutationPromise<UpdateCollectionCardData, UpdateCollectionCardVariables>;

interface SearchCardsRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: SearchCardsVariables): QueryRef<SearchCardsData, SearchCardsVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: SearchCardsVariables): QueryRef<SearchCardsData, SearchCardsVariables>;
  operationName: string;
}
export const searchCardsRef: SearchCardsRef;

export function searchCards(vars: SearchCardsVariables): QueryPromise<SearchCardsData, SearchCardsVariables>;
export function searchCards(dc: DataConnect, vars: SearchCardsVariables): QueryPromise<SearchCardsData, SearchCardsVariables>;

