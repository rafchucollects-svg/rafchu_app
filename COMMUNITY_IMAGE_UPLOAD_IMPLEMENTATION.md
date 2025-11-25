# Community Image Upload Feature - Implementation Summary

**Status:** In Progress  
**Date:** October 16, 2025

---

## 🎯 Feature Overview

Allow users to submit card images for cards missing pictures. Admins review and approve submissions before they become public.

---

## ✅ Completed Components

### 1. **ImageUploadModal.jsx** ✓
- User-facing modal for image uploads
- File validation (5MB max, images only)
- Preview before upload
- Firebase Storage upload to `/community-images/pending/`
- Firestore submission record creation

### 2. **Firebase Storage Rules** ✓
```
/community-images/pending/{filename}
- CREATE: Authenticated users
- READ: Public (for admin preview)
- DELETE: Admins only

/community-images/approved/{filename}
- READ: Public
- WRITE/DELETE: Admins only
```

### 3. **Firestore Rules** ✓
```
/communityImageSubmissions/{submissionId}
- CREATE: Authenticated users (own submissions)
- READ: User (own) OR Admin (all)
- UPDATE/DELETE: Admins only

/approvedCommunityImages/{cardId}
- READ: Public
- WRITE/DELETE: Admins only
```

---

## 📋 Remaining Tasks

### 4. **Update Card Display Logic**
**Files to modify:**
- `src/pages/CardSearch.jsx` - Add "Upload Image" button to active card detail
- `src/components/CardComponents.jsx` - Maybe add upload icon to search results

**Functionality:**
- Show "Upload Image" button when `card.image === null`
- Open `ImageUploadModal` when clicked
- Check for approved community images before showing placeholder

### 5. **Admin Review Panel**
**Create:** `src/pages/AdminImageReview.jsx`

**Features:**
- List all pending submissions
- Show: Card name, set, number, submitted by, image preview
- Actions:
  - **Approve**: Move image to `/approved/`, create `approvedCommunityImages` record
  - **Reject**: Delete image, update submission status
  - **View Details**: Show full-size image

**Route:** `/admin/image-reviews` (add to Router.jsx)

### 6. **Helper Function: Get Card Image**
**Create:** `src/utils/imageHelpers.js`

```javascript
export async function getCardImage(card) {
  // 1. Try card.image (from CardMarket)
  if (card.image) return card.image;
  
  // 2. Check for approved community image
  const communityImage = await getCommunityImage(card.id);
  if (communityImage) return communityImage;
  
  // 3. Return null (will show placeholder + upload button)
  return null;
}
```

---

## 🗄️ Data Structure

### **Firestore: `/communityImageSubmissions/{id}`**
```json
{
  "cardId": "string",
  "cardName": "string",
  "cardSet": "string",
  "cardNumber": "string",
  "imageUrl": "string",  // Storage URL
  "storagePath": "string",  // Full path in Storage
  "submittedBy": "uid",
  "submittedByEmail": "email",
  "submittedAt": "timestamp",
  "status": "pending|approved|rejected",
  "reviewedBy": "uid",
  "reviewedAt": "timestamp",
  "reviewNotes": "string"
}
```

### **Firestore: `/approvedCommunityImages/{cardId}`**
```json
{
  "cardId": "string",
  "cardName": "string",
  "cardSet": "string",
  "cardNumber": "string",
  "imageUrl": "string",  // Approved image URL
  "approvedAt": "timestamp",
  "approvedBy": "uid",
  "submissionId": "string"  // Reference to original submission
}
```

---

## 🔄 Workflow

### **User Submission:**
1. User searches for card → No image shown
2. Click "Upload Image" button
3. Select image file
4. Preview and submit
5. Image uploaded to `/community-images/pending/`
6. Record created in `communityImageSubmissions`

### **Admin Review:**
1. Admin visits `/admin/image-reviews`
2. See list of pending submissions
3. View image preview
4. **Approve:**
   - Move image: `pending/` → `approved/`
   - Create `approvedCommunityImages` record
   - Update submission: `status = 'approved'`
5. **Reject:**
   - Delete image from Storage
   - Update submission: `status = 'rejected'`

### **Display Logic:**
1. Card displayed → Check for image
2. Try CardMarket image first
3. If null, check `approvedCommunityImages`
4. If none, show placeholder + "Upload Image" button

---

## 🚀 Deployment Checklist

- [ ] Deploy Firestore rules
- [ ] Deploy Storage rules
- [ ] Deploy frontend (ImageUploadModal)
- [ ] Deploy admin panel
- [ ] Test submission flow
- [ ] Test approval flow
- [ ] Test image display logic
- [ ] Monitor Storage usage

---

## 📊 Analytics to Track

- Total submissions
- Approval/rejection rate
- Most contributed users
- Cards with most submissions
- Storage usage

---

## 🎯 Future Enhancements

1. **User contribution leaderboard**
2. **Reputation system** (approved submissions = points)
3. **Multiple image versions** (different languages, variants)
4. **Image quality scoring** (resolution, clarity)
5. **Community voting** on best images
6. **Automatic duplicate detection**
7. **Batch approval tools** for admins

---

**Next Steps:**
1. Add upload button to card display (Task 5)
2. Create admin review panel (Task 4)
3. Deploy and test (Task 6)

