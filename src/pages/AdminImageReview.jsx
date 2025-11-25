import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Loader2, Image as ImageIcon } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  updateDoc,
  setDoc,
  deleteDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { getStorage, ref, deleteObject, getDownloadURL, uploadBytes } from 'firebase/storage';

/**
 * AdminImageReview - Review and approve/reject community image submissions
 * Only accessible to admins
 */

export function AdminImageReview() {
  const { user, userProfile } = useApp();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null); // Track which submission is being processed
  
  // Load pending submissions
  useEffect(() => {
    if (!user || !userProfile?.isAdmin) return;
    
    loadSubmissions();
  }, [user, userProfile]);

  const loadSubmissions = async () => {
    try {
      setLoading(true);
      const db = getFirestore();
      const q = query(
        collection(db, 'communityImageSubmissions'),
        where('status', '==', 'pending')
      );
      
      const querySnapshot = await getDocs(q);
      const subs = [];
      querySnapshot.forEach((doc) => {
        subs.push({
          id: doc.id,
          ...doc.data(),
        });
      });
      
      // Sort by submission date (newest first)
      subs.sort((a, b) => {
        const aTime = a.submittedAt?.toMillis?.() || 0;
        const bTime = b.submittedAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      
      setSubmissions(subs);
    } catch (error) {
      console.error('Error loading submissions:', error);
      alert('Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (submission) => {
    if (!window.confirm(`Approve image for ${submission.cardName}?`)) return;
    
    setProcessing(submission.id);
    try {
      const storage = getStorage();
      const db = getFirestore();
      
      // 1. Move image from pending to approved folder
      const pendingRef = ref(storage, submission.storagePath);
      const filename = submission.storagePath.split('/').pop();
      const approvedRef = ref(storage, `community-images/approved/${filename}`);
      
      // Download and re-upload (Firebase doesn't have native move)
      const downloadUrl = await getDownloadURL(pendingRef);
      const response = await fetch(downloadUrl);
      const blob = await response.blob();
      await uploadBytes(approvedRef, blob);
      
      // Get new URL
      const approvedUrl = await getDownloadURL(approvedRef);
      
      // 2. Create approved community image record
      await setDoc(doc(db, 'approvedCommunityImages', submission.cardId), {
        cardId: submission.cardId,
        cardName: submission.cardName,
        cardSet: submission.cardSet,
        cardNumber: submission.cardNumber,
        imageUrl: approvedUrl,
        approvedAt: serverTimestamp(),
        approvedBy: user.uid,
        submissionId: submission.id,
      });
      
      // 3. Update submission status
      await updateDoc(doc(db, 'communityImageSubmissions', submission.id), {
        status: 'approved',
        reviewedBy: user.uid,
        reviewedAt: serverTimestamp(),
        reviewNotes: 'Approved',
      });
      
      // 4. Delete pending image
      await deleteObject(pendingRef);
      
      console.log('✅ Image approved successfully');
      
      // Remove from list
      setSubmissions(prev => prev.filter(s => s.id !== submission.id));
      
    } catch (error) {
      console.error('❌ Error approving image:', error);
      alert('Failed to approve image. Please try again.');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (submission) => {
    const reason = window.prompt('Reason for rejection (will be shown to user):');
    if (!reason) return;
    
    setProcessing(submission.id);
    try {
      const storage = getStorage();
      const db = getFirestore();
      
      // 1. Delete pending image from storage
      const pendingRef = ref(storage, submission.storagePath);
      await deleteObject(pendingRef);
      
      // 2. Update submission status
      await updateDoc(doc(db, 'communityImageSubmissions', submission.id), {
        status: 'rejected',
        reviewedBy: user.uid,
        reviewedAt: serverTimestamp(),
        reviewNotes: reason,
      });
      
      console.log('✅ Image rejected');
      
      // Remove from list
      setSubmissions(prev => prev.filter(s => s.id !== submission.id));
      
    } catch (error) {
      console.error('❌ Error rejecting image:', error);
      alert('Failed to reject image. Please try again.');
    } finally {
      setProcessing(null);
    }
  };

  // Check if user is admin
  if (!user || !userProfile?.isAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <h2 className="text-xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">
              You must be an admin to access this page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Community Image Review</h1>
        <p className="text-muted-foreground mt-2">
          Review and approve community-submitted card images
        </p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading submissions...</p>
          </CardContent>
        </Card>
      ) : submissions.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Pending Submissions</h3>
            <p className="text-sm text-muted-foreground">
              All community image submissions have been reviewed.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground mb-4">
            {submissions.length} submission{submissions.length !== 1 ? 's' : ''} pending review
          </div>
          
          {submissions.map((submission) => (
            <Card key={submission.id}>
              <CardContent className="p-6">
                <div className="grid md:grid-cols-[300px,1fr] gap-6">
                  {/* Image Preview */}
                  <div>
                    <div className="aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden border-2 border-gray-200">
                      <img
                        src={submission.imageUrl}
                        alt={submission.cardName}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>

                  {/* Details */}
                  <div className="flex flex-col justify-between">
                    <div>
                      <h3 className="text-xl font-bold mb-1">{submission.cardName}</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        {submission.cardSet && `${submission.cardSet} • `}
                        {submission.cardNumber && `#${submission.cardNumber}`}
                      </p>

                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="font-semibold">Submitted by:</span>{' '}
                          <span className="text-muted-foreground">{submission.submittedByEmail}</span>
                        </div>
                        <div>
                          <span className="font-semibold">Submitted:</span>{' '}
                          <span className="text-muted-foreground">
                            {submission.submittedAt?.toDate?.()?.toLocaleDateString?.() || 'Unknown'}
                          </span>
                        </div>
                        <div>
                          <span className="font-semibold">Card ID:</span>{' '}
                          <span className="text-muted-foreground font-mono text-xs">{submission.cardId}</span>
                        </div>
                      </div>

                      {/* Guidelines Reminder */}
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs">
                        <p className="font-semibold mb-1">✓ Check for:</p>
                        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                          <li>High quality, clear image</li>
                          <li>Card centered and well-lit</li>
                          <li>No watermarks or logos</li>
                          <li>Matches the exact card variant</li>
                        </ul>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 mt-6">
                      <Button
                        onClick={() => handleApprove(submission)}
                        disabled={processing === submission.id}
                        className="flex-1 bg-green-600 hover:bg-green-700"
                      >
                        {processing === submission.id ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Approving...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Approve
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={() => handleReject(submission)}
                        disabled={processing === submission.id}
                        variant="destructive"
                        className="flex-1"
                      >
                        {processing === submission.id ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Rejecting...
                          </>
                        ) : (
                          <>
                            <XCircle className="mr-2 h-4 w-4" />
                            Reject
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

