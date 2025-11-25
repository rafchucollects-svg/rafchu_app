import { AddToWishlistData, AddToWishlistVariables, GetCollectionCardsData, UpdateCollectionCardData, UpdateCollectionCardVariables, SearchCardsData, SearchCardsVariables } from '../';
import { UseDataConnectQueryResult, useDataConnectQueryOptions, UseDataConnectMutationResult, useDataConnectMutationOptions} from '@tanstack-query-firebase/react/data-connect';
import { UseQueryResult, UseMutationResult} from '@tanstack/react-query';
import { DataConnect } from 'firebase/data-connect';
import { FirebaseError } from 'firebase/app';


export function useAddToWishlist(options?: useDataConnectMutationOptions<AddToWishlistData, FirebaseError, AddToWishlistVariables>): UseDataConnectMutationResult<AddToWishlistData, AddToWishlistVariables>;
export function useAddToWishlist(dc: DataConnect, options?: useDataConnectMutationOptions<AddToWishlistData, FirebaseError, AddToWishlistVariables>): UseDataConnectMutationResult<AddToWishlistData, AddToWishlistVariables>;

export function useGetCollectionCards(options?: useDataConnectQueryOptions<GetCollectionCardsData>): UseDataConnectQueryResult<GetCollectionCardsData, undefined>;
export function useGetCollectionCards(dc: DataConnect, options?: useDataConnectQueryOptions<GetCollectionCardsData>): UseDataConnectQueryResult<GetCollectionCardsData, undefined>;

export function useUpdateCollectionCard(options?: useDataConnectMutationOptions<UpdateCollectionCardData, FirebaseError, UpdateCollectionCardVariables>): UseDataConnectMutationResult<UpdateCollectionCardData, UpdateCollectionCardVariables>;
export function useUpdateCollectionCard(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateCollectionCardData, FirebaseError, UpdateCollectionCardVariables>): UseDataConnectMutationResult<UpdateCollectionCardData, UpdateCollectionCardVariables>;

export function useSearchCards(vars: SearchCardsVariables, options?: useDataConnectQueryOptions<SearchCardsData>): UseDataConnectQueryResult<SearchCardsData, SearchCardsVariables>;
export function useSearchCards(dc: DataConnect, vars: SearchCardsVariables, options?: useDataConnectQueryOptions<SearchCardsData>): UseDataConnectQueryResult<SearchCardsData, SearchCardsVariables>;
