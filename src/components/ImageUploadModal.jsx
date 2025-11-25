import { useState } from 'react';
import { X, Upload, Loader2, CheckCircle } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { useApp } from '@/contexts/AppContext';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * ImageUploadModal - Community-driven card image upload
 * Allows users to submit images for cards that don't have them
 * Admins review and approve submissions
 */

export function ImageUploadModal({ isOpen, onClose, card }) {
  const { user } = useApp();
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  if (!isOpen || !card) return null;

  const validateAndSetFile = (file) => {
    if (!file) return false;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPG, PNG, WebP)');
      return false;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return false;
    }

    setError('');
    setSelectedFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result);
    };
    reader.readAsDataURL(file);
    return true;
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    validateAndSetFile(file);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      validateAndSetFile(files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile || !user) return;

    setUploading(true);
    setError('');

    try {
      const storage = getStorage();
      const db = getFirestore();

      // Create unique filename
      const timestamp = Date.now();
      const sanitizedCardName = (card.name || 'card').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
      const fileExtension = selectedFile.name.split('.').pop() || 'jpg';
      const filename = `${sanitizedCardName}-${timestamp}.${fileExtension}`;
      const storageRef = ref(storage, `community-images/pending/${filename}`);

      console.log('📤 Uploading image to Firebase Storage...');
      console.log('Storage path:', `community-images/pending/${filename}`);
      console.log('File size:', selectedFile.size, 'bytes');
      console.log('File type:', selectedFile.type);
      
      // Upload image with metadata
      const metadata = {
        contentType: selectedFile.type,
        customMetadata: {
          uploadedBy: user.uid,
          uploadedByEmail: user.email || '',
          cardName: card.name || '',
          cardId: card.id || '',
        }
      };

      const snapshot = await uploadBytes(storageRef, selectedFile, metadata);
      console.log('✅ Upload snapshot:', snapshot);

      const imageUrl = await getDownloadURL(snapshot.ref);
      console.log('✅ Image uploaded:', imageUrl);

      // Create submission record with better card identification
      const submission = {
        cardId: card.id || `${card.name}-${card.set}-${card.number}`.replace(/\s+/g, '-').toLowerCase(),
        cardName: card.name || 'Unknown Card',
        cardSet: card.set || '',
        cardNumber: card.number || '',
        imageUrl: imageUrl,
        storagePath: snapshot.ref.fullPath,
        submittedBy: user.uid,
        submittedByEmail: user.email || 'unknown',
        submittedAt: serverTimestamp(),
        status: 'pending', // pending, approved, rejected
        reviewedBy: null,
        reviewedAt: null,
        reviewNotes: '',
      };

      console.log('📝 Creating submission record:', submission);
      const docRef = await addDoc(collection(db, 'communityImageSubmissions'), submission);
      console.log('✅ Submission recorded in Firestore with ID:', docRef.id);

      setSubmitted(true);

      // Close modal after 2 seconds
      setTimeout(() => {
        onClose();
        setSubmitted(false);
        setSelectedFile(null);
        setPreview(null);
      }, 2000);

    } catch (err) {
      console.error('❌ Upload error:', err);
      console.error('Error details:', {
        code: err.code,
        message: err.message,
        name: err.name,
      });
      setError(`Failed to upload: ${err.message || 'Unknown error'}. Please try again.`);
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (!uploading) {
      setSelectedFile(null);
      setPreview(null);
      setError('');
      setSubmitted(false);
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto"
      onClick={handleClose}
    >
      <Card 
        className="max-w-lg w-full max-h-[90vh] overflow-y-auto my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold">Upload Card Image</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Help the community by submitting an image for this card
              </p>
            </div>
            <button
              onClick={handleClose}
              disabled={uploading}
              className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Card Info */}
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <p className="font-semibold">{card.name}</p>
            <p className="text-sm text-muted-foreground">
              {card.set && `${card.set} • `}
              {card.number && `#${card.number}`}
            </p>
          </div>

          {submitted ? (
            /* Success State */
            <div className="text-center py-8">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Image Submitted!</h3>
              <p className="text-sm text-muted-foreground">
                Thank you for contributing! An admin will review your submission.
              </p>
            </div>
          ) : (
            /* Upload Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* File Input */}
              {!preview ? (
                <div 
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    isDragging 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="image-upload"
                    disabled={uploading}
                  />
                  <label 
                    htmlFor="image-upload" 
                    className="cursor-pointer block"
                  >
                    <Upload className={`h-12 w-12 mx-auto mb-3 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
                    <p className="font-medium mb-1">
                      {isDragging ? 'Drop image here' : 'Click or drag to upload'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      JPG, PNG or WebP (max 5MB)
                    </p>
                  </label>
                </div>
              ) : (
                /* Preview */
                <div className="space-y-3">
                  <div className="relative aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden">
                    <img 
                      src={preview} 
                      alt="Preview" 
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedFile(null);
                      setPreview(null);
                    }}
                    disabled={uploading}
                    className="w-full"
                  >
                    Choose Different Image
                  </Button>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                  {error}
                </div>
              )}

              {/* Guidelines */}
              <div className="text-xs text-muted-foreground bg-blue-50 p-3 rounded-lg">
                <p className="font-semibold mb-1">📸 Image Guidelines:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Use high-quality, clear images</li>
                  <li>Card should be centered and well-lit</li>
                  <li>No watermarks or logos</li>
                  <li>Must match the exact card variant</li>
                </ul>
              </div>

              {/* Submit Button */}
              <div className="flex gap-3 pt-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleClose}
                  disabled={uploading}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={!selectedFile || uploading}
                  className="flex-1"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    'Submit Image'
                  )}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

