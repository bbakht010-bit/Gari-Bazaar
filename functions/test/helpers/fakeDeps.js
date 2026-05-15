function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function applyFieldValue(existingValue, incomingValue) {
  if (incomingValue && typeof incomingValue === "object" && Object.prototype.hasOwnProperty.call(incomingValue, "__increment")) {
    return Number(existingValue || 0) + Number(incomingValue.__increment || 0);
  }
  if (incomingValue === "__SERVER_TIMESTAMP__") {
    return "SERVER_TIMESTAMP";
  }
  return clone(incomingValue);
}

function mergeObjects(baseValue, nextValue) {
  const result = { ...(baseValue || {}) };
  for (const [key, value] of Object.entries(nextValue || {})) {
    result[key] = applyFieldValue(result[key], value);
  }
  return result;
}

function createDocRef(store, pathValue) {
  return {
    path: pathValue,
    async get() {
      return createSnapshot(store, pathValue);
    },
    async set(value, options = {}) {
      const existing = store.get(pathValue);
      store.set(pathValue, options.merge ? mergeObjects(existing, value) : clone(value));
    },
    async update(value) {
      const existing = store.get(pathValue);
      if (existing === undefined) {
        throw new Error(`Document does not exist: ${pathValue}`);
      }
      store.set(pathValue, mergeObjects(existing, value));
    },
    async delete() {
      store.delete(pathValue);
    }
  };
}

function createSnapshot(store, pathValue) {
  const value = store.has(pathValue) ? store.get(pathValue) : undefined;
  return {
    id: pathValue.split("/").pop(),
    exists: value !== undefined,
    data() {
      return clone(value);
    },
    ref: createDocRef(store, pathValue)
  };
}

function createQuery(store, collectionName, field, op, expectedValue) {
  return {
    _isQuery: true,
    async get() {
      const docs = [];
      for (const [pathValue, value] of store.entries()) {
        if (!pathValue.startsWith(collectionName + "/")) continue;
        if (pathValue.slice(collectionName.length + 1).includes("/")) continue;
        if (op === "==" && String((value || {})[field] || "") === String(expectedValue || "")) {
          docs.push(createSnapshot(store, pathValue));
        }
      }
      return { docs };
    }
  };
}

function createFakeDb(initialDocs = {}) {
  const store = new Map(Object.entries(initialDocs).map(([pathValue, value]) => [pathValue, clone(value)]));

  const db = {
    doc(pathValue) {
      return createDocRef(store, pathValue);
    },
    collection(name) {
      return {
        doc(id) {
          const docId = id || Math.random().toString(36).slice(2);
          return createDocRef(store, `${name}/${docId}`);
        },
        where(field, op, value) {
          return createQuery(store, name, field, op, value);
        },
        async get() {
          return createQuery(store, name, "id", "==", "__never__").get();
        }
      };
    },
    async runTransaction(callback) {
      const tx = {
        async get(target) {
          if (target && target._isQuery) {
            return target.get();
          }
          return createSnapshot(store, target.path);
        },
        set(ref, value, options = {}) {
          const existing = store.get(ref.path);
          store.set(ref.path, options.merge ? mergeObjects(existing, value) : clone(value));
        },
        update(ref, value) {
          const existing = store.get(ref.path);
          if (existing === undefined) {
            throw new Error(`Document does not exist: ${ref.path}`);
          }
          store.set(ref.path, mergeObjects(existing, value));
        },
        delete(ref) {
          store.delete(ref.path);
        }
      };
      return callback(tx);
    },
    batch() {
      const operations = [];
      return {
        update(ref, value) {
          operations.push(() => {
            const existing = store.get(ref.path);
            if (existing === undefined) {
              throw new Error(`Document does not exist: ${ref.path}`);
            }
            store.set(ref.path, mergeObjects(existing, value));
          });
        },
        async commit() {
          operations.forEach((operation) => operation());
        }
      };
    },
    __get(pathValue) {
      return clone(store.get(pathValue));
    }
  };

  return db;
}

const fieldValue = {
  serverTimestamp() {
    return "__SERVER_TIMESTAMP__";
  },
  increment(amount) {
    return { __increment: Number(amount || 0) };
  }
};

module.exports = {
  createFakeDb,
  fieldValue
};
