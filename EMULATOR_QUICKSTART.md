# Firebase Emulator Quick Start Guide

**Version:** v2.1 Development  
**Status:** ✅ Ready to use!

---

## 🚀 **QUICK START (3 Steps)**

### **Step 1: Start Firebase Emulators**

Open a terminal and run:

```bash
npm run emulators
```

Or:

```bash
firebase emulators:start
```

**You'll see:**
```
✔  All emulators ready! It is now safe to connect your app.
┌─────────────────────────────────────────────────────────────┐
│ ✔  All emulators ready! View status and logs at:           │
│   http://localhost:4000                                     │
├─────────────────────────────────────────────────────────────┤
│ ┌───────────────┬────────────────┬───────────────────────┐ │
│ │ Emulator      │ Host:Port      │ View in UI            │ │
│ ├───────────────┼────────────────┼───────────────────────┤ │
│ │ Authentication│ localhost:9099 │ http://localhost:4000 │ │
│ │ Firestore     │ localhost:8080 │ http://localhost:4000 │ │
│ │ Hosting       │ localhost:5000 │ n/a                   │ │
│ └───────────────┴────────────────┴───────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Keep this terminal running!**

---

### **Step 2: Start Your Development Server**

Open a **NEW terminal** and run:

```bash
npm run dev
```

**You'll see:**
```
  VITE v7.1.7  ready in 500 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

---

### **Step 3: Open Your App**

Visit: **http://localhost:5173**

**Check the console** - you should see:

```
🔧 Connected to Firebase Emulators
   Auth: http://localhost:9099
   Firestore: localhost:8080
   Emulator UI: http://localhost:4000
```

**That's it! You're now using emulators!** 🎉

---

## 📊 **EMULATOR UI**

Visit **http://localhost:4000** to see:
- 👤 **Authentication**: View test users
- 📄 **Firestore**: Browse collections and documents
- ⚡ **Functions**: View function logs (if using Cloud Functions)
- 📊 **Monitoring**: See all emulator activity

---

## 🌱 **SEED TEST DATA**

### **Option 1: Automatic Seeding**

Run the seed script to populate test data:

```bash
npm run seed
```

**This creates:**
- ✅ 3 test users (collector, vendor, admin)
- ✅ Sample cards in collections
- ✅ Sample inventory items
- ✅ Sample wishlist items

**Test Accounts:**
- **Collector:** collector@test.com / password123
- **Vendor:** vendor@test.com / password123  
- **Admin:** admin@test.com / password123

### **Option 2: Manual Creation**

Just use your app normally! Create users, add cards, etc.

---

## 💾 **SAVING & LOADING DATA**

### **Export Emulator Data**

Save your current emulator state:

```bash
npm run emulators:export
```

This saves to `./emulator-data/`

### **Import Emulator Data**

Start emulators with saved data:

```bash
npm run emulators:import
```

**Use case:** Save a "good state" and reload it anytime!

---

## 🔄 **TYPICAL WORKFLOW**

### **Daily Development:**

1. **Morning:**
   ```bash
   # Terminal 1
   npm run emulators
   
   # Terminal 2
   npm run dev
   ```

2. **Work on features** (Variants, Graded, Japanese support)

3. **Test in browser:** http://localhost:5173

4. **Check Firestore data:** http://localhost:4000

5. **End of day:**
   - Press `Ctrl+C` in both terminals
   - Emulator data is wiped (fresh start tomorrow)

---

### **Save Good State:**

When you have good test data:

```bash
# Export current state
npm run emulators:export

# Next time, load it:
npm run emulators:import
```

---

## 🎯 **TESTING v2.1 FEATURES**

### **Testing Variants:**

1. Search for a card (e.g., "Charizard")
2. Add to collection
3. Select variant: "1st Edition", "Shadowless", "Unlimited"
4. Check that variant is saved correctly

### **Testing Graded Cards:**

1. Search for a card (e.g., "Pikachu VMAX")
2. Add to collection
3. Mark as graded: PSA 10
4. Enter graded price
5. Verify graded vs raw comparison

### **Testing Japanese Cards:**

1. Search for a Japanese card
2. Add to collection
3. Mark language as "Japanese"
4. Enter manual price (if needed)
5. Verify Japanese indicator displays

---

## 🐛 **TROUBLESHOOTING**

### **"Could not connect to emulators"**

**Problem:** Emulators aren't running  
**Solution:** Start emulators first (`npm run emulators`)

---

### **"Port already in use"**

**Problem:** Something is using the emulator ports  
**Solution:**

```bash
# Find and kill process on port 8080 (Firestore)
lsof -ti:8080 | xargs kill -9

# Or use different ports in firebase.json
```

---

### **Changes don't appear**

**Problem:** Using cached data  
**Solution:**

1. Stop emulators (`Ctrl+C`)
2. Delete `emulator-data/` folder
3. Restart emulators

---

### **"Firebase connected to PRODUCTION"**

**Problem:** Not in development mode  
**Solution:**

- Check you ran `npm run dev` (not `npm run build` + `npm run preview`)
- Emulators should be running
- Check console for connection messages

---

## ⚠️ **IMPORTANT NOTES**

### **1. Emulator Data is TEMPORARY**

- Emulator data is wiped when emulators stop
- Save important test states with `npm run emulators:export`

### **2. Production is SAFE**

- Emulators use **localhost** only
- Zero risk to production data
- Even uses same Firebase config!

### **3. Not ALL Features Work**

- ❌ Firebase Analytics (disabled in emulators)
- ❌ Cloud Messaging (FCM)
- ❌ Some external API calls (if they validate origin)
- ✅ Everything else works!

### **4. Deployment Uses PRODUCTION**

When you run `firebase deploy`, it deploys to **production**, NOT emulators.

---

## 📝 **HELPFUL COMMANDS**

```bash
# Start emulators
npm run emulators

# Start emulators with saved data
npm run emulators:import

# Save emulator state
npm run emulators:export

# Seed test data
npm run seed

# Start dev server (uses emulators automatically)
npm run dev

# Build for production (ignores emulators)
npm run build

# Deploy to production
firebase deploy
```

---

## 🎓 **UNDERSTANDING THE SETUP**

### **How it Works:**

1. **`firebase.json`** - Configures emulator ports
2. **`src/AppWrapper.jsx`** - Connects to emulators in dev mode
3. **`import.meta.env.DEV`** - Vite's development mode flag
4. **Automatic switching** - Dev = emulators, Production = real Firebase

### **Key Code:**

```javascript
// In src/AppWrapper.jsx
if (import.meta.env.DEV && !useEmulators) {
  connectAuthEmulator(auth, "http://localhost:9099");
  connectFirestoreEmulator(db, "localhost", 8080);
  console.log("🔧 Connected to Firebase Emulators");
}
```

### **What This Means:**

- **Development:** `npm run dev` → Uses emulators
- **Production:** `npm run build` + deploy → Uses real Firebase
- **No code changes needed!**

---

## ✅ **YOU'RE READY!**

Now you can:
- ✅ Develop locally with emulators
- ✅ Test v2.1 features safely
- ✅ Iterate quickly without API costs
- ✅ Never worry about breaking production

---

## 🚀 **START BUILDING v2.1!**

```bash
# Terminal 1: Emulators
npm run emulators

# Terminal 2: Dev server  
npm run dev

# Browser
# Open: http://localhost:5173
# Emulator UI: http://localhost:4000
```

**Happy coding!** 🎉

---

**Questions?** Check the console logs - they'll guide you!










