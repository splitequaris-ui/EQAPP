/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  QueryConstraint,
  DocumentData,
  WithFieldValue
} from "firebase/firestore";
import { db, auth } from "./firebase";

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error Safe-Catcher Log:", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Reactive local storage store for Mock Mode
type Listener = () => void;
const mockStoreListeners: Set<Listener> = new Set();

export function subscribeToMockStore(callback: Listener) {
  mockStoreListeners.add(callback);
  return () => {
    mockStoreListeners.delete(callback);
  };
}

export function notifyMockStoreChange() {
  mockStoreListeners.forEach((cb) => cb());
}

export function isMockMode(): boolean {
  return localStorage.getItem("dispute_mock_auth") === "true";
}

function getStorageKey(path: string): string {
  return `mock_db_${path.replace(/\//g, "_")}`;
}

export function getLocalCollection(collectionPath: string): any[] {
  const key = getStorageKey(collectionPath);
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
}

export function saveLocalCollection(collectionPath: string, items: any[]) {
  const key = getStorageKey(collectionPath);
  localStorage.setItem(key, JSON.stringify(items));
  notifyMockStoreChange();
}

// 1. Get single document
export async function dbGetDoc(collectionPath: string, docId: string) {
  if (isMockMode()) {
    const list = getLocalCollection(collectionPath);
    const docData = list.find((item) => item.id === docId || item.uid === docId);
    return {
      exists: () => !!docData,
      data: () => docData,
    } as any;
  }

  const fullPath = `${collectionPath}/${docId}`;
  try {
    const docRef = doc(db, collectionPath, docId);
    const snap = await getDoc(docRef);
    return snap;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, fullPath);
  }
}

// 2. Get list of documents in collection with constraints
export async function dbGetDocs(collectionPath: string, ...constraints: QueryConstraint[]) {
  if (isMockMode()) {
    const list = getLocalCollection(collectionPath);
    return {
      forEach: (callback: (doc: any) => void) => {
        list.forEach((item) => {
          callback({
            id: item.id || item.uid,
            data: () => item,
          });
        });
      },
      docs: list.map((item) => ({
        id: item.id || item.uid,
        data: () => item,
      })),
    } as any;
  }

  try {
    const collRef = collection(db, collectionPath);
    const q = query(collRef, ...constraints);
    const snap = await getDocs(q);
    return snap;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionPath);
  }
}

// 2b. Get documents in chunks using the 'in' query operator to optimize batch fetches
export async function dbGetDocsInBatches(collectionPath: string, field: string, values: string[]): Promise<any[]> {
  if (values.length === 0) return [];

  if (isMockMode()) {
    const list = getLocalCollection(collectionPath);
    const filtered = list.filter((item) => values.includes(item[field] || item.id || item.uid));
    return filtered;
  }

  // Optimization & Rules Bypass:
  // If we are querying profiles or users by uid, fetch each document individually using getDoc.
  // This executes "get" operations instead of "list" queries, bypassing firestore listing rule constraints!
  if ((collectionPath === "profiles" || collectionPath === "users") && field === "uid") {
    const promises = values.map(async (id) => {
      try {
        const docRef = doc(db, collectionPath, id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          return { id: docSnap.id, ...docSnap.data() };
        }
      } catch (err) {
        console.error(`Error fetching individual doc ${collectionPath}/${id}:`, err);
      }
      return null;
    });
    const results = await Promise.all(promises);
    return results.filter((item): item is any => item !== null);
  }

  const chunks: string[][] = [];
  for (let i = 0; i < values.length; i += 30) {
    chunks.push(values.slice(i, i + 30));
  }

  const results: any[] = [];
  try {
    const collRef = collection(db, collectionPath);
    for (const chunk of chunks) {
      const q = query(collRef, where(field, "in", chunk));
      const snap = await getDocs(q);
      snap.forEach((doc) => {
        results.push({ id: doc.id, ...doc.data() });
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionPath);
  }
  return results;
}

// 3. Set document at explicit location
export async function dbSetDoc<T extends WithFieldValue<DocumentData>>(collectionPath: string, docId: string, data: T) {
  if (isMockMode()) {
    const list = getLocalCollection(collectionPath);
    const index = list.findIndex((item) => item.id === docId || item.uid === docId);
    const updatedData = { ...(data as any), id: docId };
    if (index >= 0) {
      list[index] = updatedData;
    } else {
      list.push(updatedData);
    }
    saveLocalCollection(collectionPath, list);
    return;
  }

  const fullPath = `${collectionPath}/${docId}`;
  try {
    const docRef = doc(db, collectionPath, docId);
    await setDoc(docRef, data);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, fullPath);
  }
}

// 4. Clean add document
export async function dbAddDoc<T extends WithFieldValue<DocumentData>>(collectionPath: string, data: T) {
  if (isMockMode()) {
    const list = getLocalCollection(collectionPath);
    const newId = `mock_id_${Math.random().toString(36).substring(2, 11)}`;
    const newItem = { ...(data as any), id: newId };
    list.push(newItem);
    saveLocalCollection(collectionPath, list);
    return { id: newId } as any;
  }

  try {
    const collRef = collection(db, collectionPath);
    const docRef = await addDoc(collRef, data);
    return docRef;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, collectionPath);
  }
}

// 5. Update document fields
export async function dbUpdateDoc(collectionPath: string, docId: string, data: any) {
  if (isMockMode()) {
    const list = getLocalCollection(collectionPath);
    const index = list.findIndex((item) => item.id === docId || item.uid === docId);
    if (index >= 0) {
      list[index] = { ...list[index], ...data };
      saveLocalCollection(collectionPath, list);
    }
    return;
  }

  const fullPath = `${collectionPath}/${docId}`;
  try {
    const docRef = doc(db, collectionPath, docId);
    await updateDoc(docRef, data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, fullPath);
  }
}

// 6. Delete document
export async function dbDeleteDoc(collectionPath: string, docId: string) {
  if (isMockMode()) {
    const list = getLocalCollection(collectionPath);
    const filtered = list.filter((item) => item.id !== docId && item.uid !== docId);
    saveLocalCollection(collectionPath, filtered);
    return;
  }

  const fullPath = `${collectionPath}/${docId}`;
  try {
    const docRef = doc(db, collectionPath, docId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, fullPath);
  }
}
