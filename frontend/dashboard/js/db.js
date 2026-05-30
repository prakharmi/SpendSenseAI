export const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SpendSenseOfflineDB', 1);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('offlineTransactions')) {
        db.createObjectStore('offlineTransactions', { keyPath: 'id', autoIncrement: true });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const addOfflineTransaction = async (transaction) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineTransactions', 'readwrite');
    const store = tx.objectStore('offlineTransactions');
    const req = store.add({ ...transaction, _offlineAddedAt: Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

export const getOfflineTransactions = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineTransactions', 'readonly');
    const store = tx.objectStore('offlineTransactions');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

export const deleteOfflineTransaction = async (id) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineTransactions', 'readwrite');
    const store = tx.objectStore('offlineTransactions');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};
