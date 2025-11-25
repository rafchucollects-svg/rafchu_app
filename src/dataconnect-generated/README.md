# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `example`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

**If you're looking for the `React README`, you can find it at [`dataconnect-generated/react/README.md`](./react/README.md)**

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*GetCollectionCards*](#getcollectioncards)
  - [*SearchCards*](#searchcards)
- [**Mutations**](#mutations)
  - [*AddToWishlist*](#addtowishlist)
  - [*UpdateCollectionCard*](#updatecollectioncard)

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `example`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@dataconnect/generated` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

There are two ways to execute a Data Connect Query using the generated Web SDK:
- Using a Query Reference function, which returns a `QueryRef`
  - The `QueryRef` can be used as an argument to `executeQuery()`, which will execute the Query and return a `QueryPromise`
- Using an action shortcut function, which returns a `QueryPromise`
  - Calling the action shortcut function will execute the Query and return a `QueryPromise`

The following is true for both the action shortcut function and the `QueryRef` function:
- The `QueryPromise` returned will resolve to the result of the Query once it has finished executing
- If the Query accepts arguments, both the action shortcut function and the `QueryRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Query
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## GetCollectionCards
You can execute the `GetCollectionCards` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getCollectionCards(): QueryPromise<GetCollectionCardsData, undefined>;

interface GetCollectionCardsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetCollectionCardsData, undefined>;
}
export const getCollectionCardsRef: GetCollectionCardsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getCollectionCards(dc: DataConnect): QueryPromise<GetCollectionCardsData, undefined>;

interface GetCollectionCardsRef {
  ...
  (dc: DataConnect): QueryRef<GetCollectionCardsData, undefined>;
}
export const getCollectionCardsRef: GetCollectionCardsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getCollectionCardsRef:
```typescript
const name = getCollectionCardsRef.operationName;
console.log(name);
```

### Variables
The `GetCollectionCards` query has no variables.
### Return Type
Recall that executing the `GetCollectionCards` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetCollectionCardsData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `GetCollectionCards`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getCollectionCards } from '@dataconnect/generated';


// Call the `getCollectionCards()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getCollectionCards();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getCollectionCards(dataConnect);

console.log(data.collectionCards);

// Or, you can use the `Promise` API.
getCollectionCards().then((response) => {
  const data = response.data;
  console.log(data.collectionCards);
});
```

### Using `GetCollectionCards`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getCollectionCardsRef } from '@dataconnect/generated';


// Call the `getCollectionCardsRef()` function to get a reference to the query.
const ref = getCollectionCardsRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getCollectionCardsRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.collectionCards);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.collectionCards);
});
```

## SearchCards
You can execute the `SearchCards` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
searchCards(vars: SearchCardsVariables): QueryPromise<SearchCardsData, SearchCardsVariables>;

interface SearchCardsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: SearchCardsVariables): QueryRef<SearchCardsData, SearchCardsVariables>;
}
export const searchCardsRef: SearchCardsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
searchCards(dc: DataConnect, vars: SearchCardsVariables): QueryPromise<SearchCardsData, SearchCardsVariables>;

interface SearchCardsRef {
  ...
  (dc: DataConnect, vars: SearchCardsVariables): QueryRef<SearchCardsData, SearchCardsVariables>;
}
export const searchCardsRef: SearchCardsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the searchCardsRef:
```typescript
const name = searchCardsRef.operationName;
console.log(name);
```

### Variables
The `SearchCards` query requires an argument of type `SearchCardsVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface SearchCardsVariables {
  name: string;
}
```
### Return Type
Recall that executing the `SearchCards` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `SearchCardsData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface SearchCardsData {
  cards: ({
    id: UUIDString;
    name: string;
    imageUrl: string;
    set: string;
  } & Card_Key)[];
}
```
### Using `SearchCards`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, searchCards, SearchCardsVariables } from '@dataconnect/generated';

// The `SearchCards` query requires an argument of type `SearchCardsVariables`:
const searchCardsVars: SearchCardsVariables = {
  name: ..., 
};

// Call the `searchCards()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await searchCards(searchCardsVars);
// Variables can be defined inline as well.
const { data } = await searchCards({ name: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await searchCards(dataConnect, searchCardsVars);

console.log(data.cards);

// Or, you can use the `Promise` API.
searchCards(searchCardsVars).then((response) => {
  const data = response.data;
  console.log(data.cards);
});
```

### Using `SearchCards`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, searchCardsRef, SearchCardsVariables } from '@dataconnect/generated';

// The `SearchCards` query requires an argument of type `SearchCardsVariables`:
const searchCardsVars: SearchCardsVariables = {
  name: ..., 
};

// Call the `searchCardsRef()` function to get a reference to the query.
const ref = searchCardsRef(searchCardsVars);
// Variables can be defined inline as well.
const ref = searchCardsRef({ name: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = searchCardsRef(dataConnect, searchCardsVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.cards);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.cards);
});
```

# Mutations

There are two ways to execute a Data Connect Mutation using the generated Web SDK:
- Using a Mutation Reference function, which returns a `MutationRef`
  - The `MutationRef` can be used as an argument to `executeMutation()`, which will execute the Mutation and return a `MutationPromise`
- Using an action shortcut function, which returns a `MutationPromise`
  - Calling the action shortcut function will execute the Mutation and return a `MutationPromise`

The following is true for both the action shortcut function and the `MutationRef` function:
- The `MutationPromise` returned will resolve to the result of the Mutation once it has finished executing
- If the Mutation accepts arguments, both the action shortcut function and the `MutationRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Mutation
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

## AddToWishlist
You can execute the `AddToWishlist` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
addToWishlist(vars: AddToWishlistVariables): MutationPromise<AddToWishlistData, AddToWishlistVariables>;

interface AddToWishlistRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: AddToWishlistVariables): MutationRef<AddToWishlistData, AddToWishlistVariables>;
}
export const addToWishlistRef: AddToWishlistRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
addToWishlist(dc: DataConnect, vars: AddToWishlistVariables): MutationPromise<AddToWishlistData, AddToWishlistVariables>;

interface AddToWishlistRef {
  ...
  (dc: DataConnect, vars: AddToWishlistVariables): MutationRef<AddToWishlistData, AddToWishlistVariables>;
}
export const addToWishlistRef: AddToWishlistRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the addToWishlistRef:
```typescript
const name = addToWishlistRef.operationName;
console.log(name);
```

### Variables
The `AddToWishlist` mutation requires an argument of type `AddToWishlistVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface AddToWishlistVariables {
  printingId: UUIDString;
}
```
### Return Type
Recall that executing the `AddToWishlist` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `AddToWishlistData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface AddToWishlistData {
  wishlistItem_insert: WishlistItem_Key;
}
```
### Using `AddToWishlist`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, addToWishlist, AddToWishlistVariables } from '@dataconnect/generated';

// The `AddToWishlist` mutation requires an argument of type `AddToWishlistVariables`:
const addToWishlistVars: AddToWishlistVariables = {
  printingId: ..., 
};

// Call the `addToWishlist()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await addToWishlist(addToWishlistVars);
// Variables can be defined inline as well.
const { data } = await addToWishlist({ printingId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await addToWishlist(dataConnect, addToWishlistVars);

console.log(data.wishlistItem_insert);

// Or, you can use the `Promise` API.
addToWishlist(addToWishlistVars).then((response) => {
  const data = response.data;
  console.log(data.wishlistItem_insert);
});
```

### Using `AddToWishlist`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, addToWishlistRef, AddToWishlistVariables } from '@dataconnect/generated';

// The `AddToWishlist` mutation requires an argument of type `AddToWishlistVariables`:
const addToWishlistVars: AddToWishlistVariables = {
  printingId: ..., 
};

// Call the `addToWishlistRef()` function to get a reference to the mutation.
const ref = addToWishlistRef(addToWishlistVars);
// Variables can be defined inline as well.
const ref = addToWishlistRef({ printingId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = addToWishlistRef(dataConnect, addToWishlistVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.wishlistItem_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.wishlistItem_insert);
});
```

## UpdateCollectionCard
You can execute the `UpdateCollectionCard` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateCollectionCard(vars: UpdateCollectionCardVariables): MutationPromise<UpdateCollectionCardData, UpdateCollectionCardVariables>;

interface UpdateCollectionCardRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateCollectionCardVariables): MutationRef<UpdateCollectionCardData, UpdateCollectionCardVariables>;
}
export const updateCollectionCardRef: UpdateCollectionCardRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateCollectionCard(dc: DataConnect, vars: UpdateCollectionCardVariables): MutationPromise<UpdateCollectionCardData, UpdateCollectionCardVariables>;

interface UpdateCollectionCardRef {
  ...
  (dc: DataConnect, vars: UpdateCollectionCardVariables): MutationRef<UpdateCollectionCardData, UpdateCollectionCardVariables>;
}
export const updateCollectionCardRef: UpdateCollectionCardRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateCollectionCardRef:
```typescript
const name = updateCollectionCardRef.operationName;
console.log(name);
```

### Variables
The `UpdateCollectionCard` mutation requires an argument of type `UpdateCollectionCardVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpdateCollectionCardVariables {
  id: UUIDString;
  condition?: string | null;
  grade?: string | null;
  isGraded?: boolean | null;
  purchaseDate?: DateString | null;
  purchasePrice?: number | null;
  quantity?: number | null;
}
```
### Return Type
Recall that executing the `UpdateCollectionCard` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateCollectionCardData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateCollectionCardData {
  updatedCount: number;
}
```
### Using `UpdateCollectionCard`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateCollectionCard, UpdateCollectionCardVariables } from '@dataconnect/generated';

// The `UpdateCollectionCard` mutation requires an argument of type `UpdateCollectionCardVariables`:
const updateCollectionCardVars: UpdateCollectionCardVariables = {
  id: ..., 
  condition: ..., // optional
  grade: ..., // optional
  isGraded: ..., // optional
  purchaseDate: ..., // optional
  purchasePrice: ..., // optional
  quantity: ..., // optional
};

// Call the `updateCollectionCard()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateCollectionCard(updateCollectionCardVars);
// Variables can be defined inline as well.
const { data } = await updateCollectionCard({ id: ..., condition: ..., grade: ..., isGraded: ..., purchaseDate: ..., purchasePrice: ..., quantity: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateCollectionCard(dataConnect, updateCollectionCardVars);

console.log(data.updatedCount);

// Or, you can use the `Promise` API.
updateCollectionCard(updateCollectionCardVars).then((response) => {
  const data = response.data;
  console.log(data.updatedCount);
});
```

### Using `UpdateCollectionCard`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateCollectionCardRef, UpdateCollectionCardVariables } from '@dataconnect/generated';

// The `UpdateCollectionCard` mutation requires an argument of type `UpdateCollectionCardVariables`:
const updateCollectionCardVars: UpdateCollectionCardVariables = {
  id: ..., 
  condition: ..., // optional
  grade: ..., // optional
  isGraded: ..., // optional
  purchaseDate: ..., // optional
  purchasePrice: ..., // optional
  quantity: ..., // optional
};

// Call the `updateCollectionCardRef()` function to get a reference to the mutation.
const ref = updateCollectionCardRef(updateCollectionCardVars);
// Variables can be defined inline as well.
const ref = updateCollectionCardRef({ id: ..., condition: ..., grade: ..., isGraded: ..., purchaseDate: ..., purchasePrice: ..., quantity: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateCollectionCardRef(dataConnect, updateCollectionCardVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.updatedCount);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.updatedCount);
});
```

