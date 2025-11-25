import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Send, Image as ImageIcon, X, CheckCircle, ThumbsUp, ThumbsDown, Star, XCircle, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

/**
 * Messages Page
 * Direct messaging between collectors and vendors
 */

export function Messages() {
  const { db, user } = useApp();
  const [searchParams] = useSearchParams();
  const conversationParam = searchParams.get("conversation");
  
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [transaction, setTransaction] = useState(null); // Transaction for this conversation
  const [zoomedImage, setZoomedImage] = useState(null); // For image zoom modal
  const [userRating, setUserRating] = useState(null); // Current user's rating stats
  const [otherUserRating, setOtherUserRating] = useState(null); // Other user's rating stats
  const [hasRated, setHasRated] = useState(false); // Whether current user has rated this transaction
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Load user's conversations
  useEffect(() => {
    if (!db || !user) return;

    const convoQuery = query(
      collection(db, "conversations"),
      where("participants", "array-contains", user.uid)
    );

    const unsubscribe = onSnapshot(convoQuery, async (snapshot) => {
      const convos = [];
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        
        // Skip if conversation is deleted by current user
        if (data.deletedBy && data.deletedBy[user.uid] === true) {
          continue;
        }
        
        const otherUserId = data.participants.find(id => id !== user.uid);
        
        // Get other user's info
        const otherUserRef = doc(db, "users", otherUserId);
        const otherUserSnap = await getDoc(otherUserRef);
        const otherUser = otherUserSnap.exists() ? otherUserSnap.data() : {};
        
        convos.push({
          id: docSnap.id,
          ...data,
          otherUser: {
            id: otherUserId,
            ...otherUser
          }
        });
      }
      
      // Sort by last message time
      convos.sort((a, b) => {
        const aTime = a.lastMessageAt?.toMillis?.() || 0;
        const bTime = b.lastMessageAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      
      setConversations(convos);
    });

    return () => unsubscribe();
  }, [db, user]);

  // Auto-select conversation from URL parameter
  useEffect(() => {
    if (conversationParam && conversations.length > 0) {
      const convo = conversations.find(c => c.id === conversationParam);
      if (convo) {
        setSelectedConversation(convo);
      }
    }
  }, [conversationParam, conversations]);

  // Load transaction for selected conversation
  useEffect(() => {
    if (!db || !selectedConversation) {
      setTransaction(null);
      setHasRated(false);
      return;
    }

    const loadTransaction = async () => {
      try {
        const transactionsQuery = query(
          collection(db, "transactions"),
          where("conversationId", "==", selectedConversation.id)
        );
        const snapshot = await getDocs(transactionsQuery);
        
        if (!snapshot.empty) {
          // Prioritize active/pending transactions over completed ones
          const allTransactions = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          
          // Find most recent non-completed/non-cancelled transaction first
          const activeTransaction = allTransactions.find(t => 
            t.status !== "completed" && t.status !== "cancelled"
          );
          
          // If no active transaction, use the most recent one
          const selectedTransaction = activeTransaction || allTransactions.sort((a, b) => {
            const aTime = a.createdAt?.toMillis?.() || 0;
            const bTime = b.createdAt?.toMillis?.() || 0;
            return bTime - aTime;
          })[0];
          
          setTransaction(selectedTransaction);
        } else {
          setTransaction(null);
          setHasRated(false);
        }
      } catch (error) {
        console.error("Failed to load transaction:", error);
      }
    };

    loadTransaction();
  }, [db, selectedConversation]);
  
  // When transaction becomes completed, add a rating prompt message
  useEffect(() => {
    if (!db || !transaction || !user || !selectedConversation) {
      return;
    }
    
    // Only allow ratings if the other user is a vendor
    if (!selectedConversation.otherUser.isVendor) {
      return;
    }
    
    if (transaction.status === "completed") {
      const addRatingPrompt = async () => {
        try {
          // Check if user has already rated this transaction
          const ratingQuery = query(
            collection(db, "ratings"),
            where("transactionId", "==", transaction.id),
            where("fromUserId", "==", user.uid)
          );
          const ratingSnap = await getDocs(ratingQuery);
          
          if (ratingSnap.empty) {
            // Check if rating prompt message already exists
            const messagesQuery = query(
              collection(db, "conversations", selectedConversation.id, "messages"),
              where("type", "==", "rating_prompt"),
              where("transactionId", "==", transaction.id)
            );
            const promptSnap = await getDocs(messagesQuery);
            
            // Add rating prompt message if it doesn't exist
            if (promptSnap.empty) {
              const messagesRef = collection(db, "conversations", selectedConversation.id, "messages");
              await addDoc(messagesRef, {
                type: "rating_prompt",
                transactionId: transaction.id,
                targetUserId: selectedConversation.otherUser.id,
                targetUsername: selectedConversation.otherUser.username || selectedConversation.otherUser.displayName,
                createdAt: serverTimestamp()
              });
              
              // Update conversation last message
              const convoRef = doc(db, "conversations", selectedConversation.id);
              await setDoc(convoRef, {
                lastMessage: "Rate your transaction",
                lastMessageAt: serverTimestamp()
              }, { merge: true });
            }
          }
        } catch (error) {
          console.error("Failed to add rating prompt:", error);
        }
      };
      
      addRatingPrompt();
    }
  }, [db, transaction, user, selectedConversation]);
  
  // Load ratings for both users
  useEffect(() => {
    if (!db || !user || !selectedConversation) return;

    const loadRatings = async () => {
      try {
        // Load current user's rating stats
        const userRatingsQuery = query(
          collection(db, "ratings"),
          where("toUserId", "==", user.uid)
        );
        const userSnapshot = await getDocs(userRatingsQuery);
        const userRatings = userSnapshot.docs.map(d => d.data());
        const userThumbsUp = userRatings.filter(r => r.thumbsUp === true).length;
        const userTotal = userRatings.length;
        const userPercentage = userTotal > 0 ? Math.round((userThumbsUp / userTotal) * 100) : null;
        
        setUserRating({
          thumbsUp: userThumbsUp,
          total: userTotal,
          percentage: userPercentage
        });

        // Load other user's rating stats
        const otherUserId = selectedConversation.otherUser.id;
        const otherRatingsQuery = query(
          collection(db, "ratings"),
          where("toUserId", "==", otherUserId)
        );
        const otherSnapshot = await getDocs(otherRatingsQuery);
        const otherRatings = otherSnapshot.docs.map(d => d.data());
        const otherThumbsUp = otherRatings.filter(r => r.thumbsUp === true).length;
        const otherTotal = otherRatings.length;
        const otherPercentage = otherTotal > 0 ? Math.round((otherThumbsUp / otherTotal) * 100) : null;
        
        setOtherUserRating({
          thumbsUp: otherThumbsUp,
          total: otherTotal,
          percentage: otherPercentage
        });
      } catch (error) {
        console.error("Failed to load ratings:", error);
      }
    };

    loadRatings();
  }, [db, user, selectedConversation]);

  // Load messages for selected conversation
  useEffect(() => {
    if (!db || !selectedConversation) return;

    const messagesQuery = query(
      collection(db, "conversations", selectedConversation.id, "messages"),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMessages(msgs);
      
      // Scroll to bottom - use instant for initial load, smooth for updates
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      }, 50);
    });

    return () => unsubscribe();
  }, [db, selectedConversation]);
  
  // Additional scroll on messages change to ensure we're at the bottom
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [messages]);

  // Handle image selection
  const handleImageSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB');
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // Send message
  const handleSendMessage = async () => {
    if (!user || !selectedConversation || (!messageText.trim() && !imageFile)) return;

    try {
      let imageUrl = null;

      // Upload image if present
      if (imageFile) {
        setUploadingImage(true);
        const storage = getStorage();
        const fileName = `${Date.now()}_${imageFile.name}`;
        const storageRef = ref(storage, `message-images/${selectedConversation.id}/${fileName}`);
        await uploadBytes(storageRef, imageFile);
        imageUrl = await getDownloadURL(storageRef);
      }

      // Add message
      const messagesRef = collection(db, "conversations", selectedConversation.id, "messages");
      await addDoc(messagesRef, {
        text: messageText.trim(),
        imageUrl,
        senderId: user.uid,
        createdAt: serverTimestamp()
      });

      // Update conversation last message and un-delete if it was deleted
      const convoRef = doc(db, "conversations", selectedConversation.id);
      await setDoc(convoRef, {
        lastMessage: messageText.trim() || "(image)",
        lastMessageAt: serverTimestamp(),
        [`deletedBy.${user.uid}`]: false, // Un-delete if conversation was hidden
        [`deletedAt.${user.uid}`]: null
      }, { merge: true });

      // Clear inputs
      setMessageText("");
      setImageFile(null);
      setImagePreview(null);
      setUploadingImage(false);
    } catch (error) {
      console.error("Failed to send message:", error);
      alert("Failed to send message. Please try again.");
      setUploadingImage(false);
    }
  };

  // Create or confirm transaction
  const handleMarkAsCompleted = async () => {
    if (!user || !selectedConversation || !db) return;

    try {
      if (!transaction) {
        // Create new transaction
        const newTransaction = await addDoc(collection(db, "transactions"), {
          conversationId: selectedConversation.id,
          buyerId: selectedConversation.otherUser.isVendor ? user.uid : selectedConversation.otherUser.id,
          sellerId: selectedConversation.otherUser.isVendor ? selectedConversation.otherUser.id : user.uid,
          status: user.uid === (selectedConversation.otherUser.isVendor ? user.uid : selectedConversation.otherUser.id) 
            ? "buyer_confirmed" 
            : "seller_confirmed",
          buyerConfirmedAt: user.uid === (selectedConversation.otherUser.isVendor ? user.uid : selectedConversation.otherUser.id)
            ? serverTimestamp()
            : null,
          sellerConfirmedAt: user.uid !== (selectedConversation.otherUser.isVendor ? user.uid : selectedConversation.otherUser.id)
            ? serverTimestamp()
            : null,
          createdAt: serverTimestamp()
        });
        
        alert("Transaction marked as completed on your end. Waiting for the other party to confirm.");
        
        // Reload transaction
        const transDoc = await getDoc(doc(db, "transactions", newTransaction.id));
        setTransaction({ id: newTransaction.id, ...transDoc.data() });
      } else {
        // Update existing transaction
        const isBuyer = user.uid === transaction.buyerId;
        const updateData = isBuyer 
          ? { status: transaction.status === "seller_confirmed" ? "completed" : "buyer_confirmed", buyerConfirmedAt: serverTimestamp() }
          : { status: transaction.status === "buyer_confirmed" ? "completed" : "seller_confirmed", sellerConfirmedAt: serverTimestamp() };
        
        const transRef = doc(db, "transactions", transaction.id);
        await setDoc(transRef, updateData, { merge: true });
        
        if (updateData.status === "completed") {
          alert("Transaction confirmed by both parties! You can now leave a rating.");
        } else {
          alert("Transaction marked as completed on your end. Waiting for the other party to confirm.");
        }
        
        // Reload transaction
        const transDoc = await getDoc(transRef);
        setTransaction({ id: transaction.id, ...transDoc.data() });
      }
    } catch (error) {
      console.error("Failed to mark transaction as completed:", error);
      alert("Failed to mark transaction as completed. Please try again.");
    }
  };

  // Submit rating (thumbs up/down)
  const handleSubmitRating = async (thumbsUp, transactionId) => {
    if (!user || !db || !selectedConversation) return;

    try {
      // Check if user already rated this transaction
      const existingRatingQuery = query(
        collection(db, "ratings"),
        where("transactionId", "==", transactionId),
        where("fromUserId", "==", user.uid)
      );
      const existingSnapshot = await getDocs(existingRatingQuery);
      
      if (!existingSnapshot.empty) {
        alert("You have already rated this transaction.");
        return;
      }

      // Determine who to rate
      const toUserId = selectedConversation.otherUser.id;
      
      // Create rating
      await addDoc(collection(db, "ratings"), {
        transactionId,
        fromUserId: user.uid,
        toUserId,
        thumbsUp,
        createdAt: serverTimestamp()
      });
      
      // Add thank you message
      const messagesRef = collection(db, "conversations", selectedConversation.id, "messages");
      await addDoc(messagesRef, {
        type: "rating_thanks",
        transactionId,
        thumbsUp,
        createdAt: serverTimestamp()
      });
      
      // Update conversation last message
      const convoRef = doc(db, "conversations", selectedConversation.id);
      await setDoc(convoRef, {
        lastMessage: "Rating submitted",
        lastMessageAt: serverTimestamp()
      }, { merge: true });
      
      // Reload ratings for both users
      const ratingsQuery = query(
        collection(db, "ratings"),
        where("toUserId", "==", toUserId)
      );
      const snapshot = await getDocs(ratingsQuery);
      const ratings = snapshot.docs.map(d => d.data());
      const thumbsUpCount = ratings.filter(r => r.thumbsUp === true).length;
      const total = ratings.length;
      const percentage = total > 0 ? Math.round((thumbsUpCount / total) * 100) : null;
      
      if (toUserId === selectedConversation.otherUser.id) {
        setOtherUserRating({
          thumbsUp: thumbsUpCount,
          total,
          percentage
        });
      }
      
      // Also reload current user's ratings
      const userRatingsQuery = query(
        collection(db, "ratings"),
        where("toUserId", "==", user.uid)
      );
      const userSnapshot = await getDocs(userRatingsQuery);
      const userRatings = userSnapshot.docs.map(d => d.data());
      const userThumbsUp = userRatings.filter(r => r.thumbsUp === true).length;
      const userTotal = userRatings.length;
      const userPercentage = userTotal > 0 ? Math.round((userThumbsUp / userTotal) * 100) : null;
      
      setUserRating({
        thumbsUp: userThumbsUp,
        total: userTotal,
        percentage: userPercentage
      });
    } catch (error) {
      console.error("Failed to submit rating:", error);
      alert("Failed to submit rating. Please try again.");
    }
  };
  
  // Cancel transaction (vendors only)
  const handleCancelTransaction = async () => {
    if (!user || !transaction || !db) return;
    
    // Check if user is a vendor
    const isVendor = selectedConversation?.otherUser?.isVendor ? 
      (user.uid === transaction.sellerId) : 
      (user.uid !== transaction.buyerId);
    
    if (!isVendor) {
      alert("Only vendors can cancel transactions.");
      return;
    }
    
    if (!confirm("Are you sure you want to cancel this transaction? This action cannot be undone and will prevent ratings.")) {
      return;
    }
    
    try {
      const transRef = doc(db, "transactions", transaction.id);
      await setDoc(transRef, {
        status: "cancelled",
        cancelledBy: user.uid,
        cancelledAt: serverTimestamp()
      }, { merge: true });
      
      const transDoc = await getDoc(transRef);
      setTransaction({ id: transaction.id, ...transDoc.data() });
      
      alert("Transaction cancelled successfully.");
    } catch (error) {
      console.error("Failed to cancel transaction:", error);
      alert("Failed to cancel transaction. Please try again.");
    }
  };
  
  // Start a new transaction in the same conversation
  const handleStartNewTransaction = async () => {
    if (!user || !selectedConversation || !db) return;
    
    try {
      // Create a new pending transaction
      const transRef = collection(db, "transactions");
      const newTransaction = {
        conversationId: selectedConversation.id,
        buyerId: selectedConversation.otherUser.isVendor ? user.uid : selectedConversation.otherUserId,
        sellerId: selectedConversation.otherUser.isVendor ? selectedConversation.otherUserId : user.uid,
        status: "pending",
        createdAt: serverTimestamp(),
      };
      
      const transDoc = await addDoc(transRef, newTransaction);
      
      // Update state to show the new transaction
      setTransaction({ id: transDoc.id, ...newTransaction, createdAt: Date.now() });
      
      // Send a system message
      const messagesRef = collection(db, "conversations", selectedConversation.id, "messages");
      await addDoc(messagesRef, {
        senderId: user.uid,
        text: "🔄 New transaction initiated",
        type: "system",
        createdAt: serverTimestamp(),
      });
      
      alert("New transaction started! You can now proceed with a new deal.");
    } catch (error) {
      console.error("Failed to start new transaction:", error);
      alert("Failed to start new transaction. Please try again.");
    }
  };
  
  // Delete a specific message
  const handleDeleteMessage = async (messageId) => {
    // Delete directly without confirmation
    
    try {
      await deleteDoc(doc(db, "conversations", selectedConversation.id, "messages", messageId));
    } catch (error) {
      console.error("Failed to delete message:", error);
      alert("Failed to delete message. Please try again.");
    }
  };
  
  // Soft delete conversation (hide it from list but keep messages)
  const handleDeleteConversation = async () => {
    // Delete directly without confirmation
    
    try {
      const convoRef = doc(db, "conversations", selectedConversation.id);
      await updateDoc(convoRef, {
        [`deletedBy.${user.uid}`]: true,
        [`deletedAt.${user.uid}`]: serverTimestamp()
      });
      
      setSelectedConversation(null);
      alert("Conversation hidden successfully.");
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      alert("Failed to delete conversation. Please try again.");
    }
  };

  if (!user) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <Card>
          <CardContent className="p-6 text-center">
            <MessageCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-semibold mb-2">Sign In Required</p>
            <p className="text-muted-foreground">
              Please sign in to access your messages.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
        <MessageCircle className="h-8 w-8" />
        Messages
      </h1>

      <div className="grid md:grid-cols-3 gap-4 h-[70vh]">
        {/* Conversations List */}
        <Card className="md:col-span-1 overflow-hidden">
          <CardContent className="p-0 h-full overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                No conversations yet
              </div>
            ) : (
              <div className="divide-y">
                {conversations.map((convo) => (
                  <div
                    key={convo.id}
                    onClick={() => setSelectedConversation(convo)}
                    className={`p-4 cursor-pointer hover:bg-accent transition ${
                      selectedConversation?.id === convo.id ? 'bg-accent' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {convo.otherUser.photoURL ? (
                        <img
                          src={convo.otherUser.photoURL}
                          alt={convo.otherUser.username}
                          className="h-12 w-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                          {convo.otherUser.username?.charAt(0) || '?'}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">
                          {convo.otherUser.username || convo.otherUser.displayName}
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          {convo.lastMessage || 'No messages yet'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Messages */}
        <Card className="md:col-span-2 overflow-hidden flex flex-col">
          {selectedConversation ? (
            <>
              {/* Header */}
              <div className="p-4 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    {selectedConversation.otherUser.photoURL ? (
                      <img
                        src={selectedConversation.otherUser.photoURL}
                        alt={selectedConversation.otherUser.username}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                        {selectedConversation.otherUser.username?.charAt(0) || '?'}
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="font-semibold">
                        {selectedConversation.otherUser.username || selectedConversation.otherUser.displayName}
                      </div>
                      {otherUserRating && otherUserRating.total > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ThumbsUp className="h-3 w-3" />
                          <span>{otherUserRating.percentage}% ({otherUserRating.total} ratings)</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {userRating && userRating.total > 0 && (
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <span>Your rating:</span>
                        <ThumbsUp className="h-3 w-3" />
                        <span>{userRating.percentage}%</span>
                      </div>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={handleDeleteConversation}
                      title="Delete conversation"
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => {
                  // System message for rating prompt
                  if (msg.type === "rating_prompt") {
                    return (
                      <div key={msg.id} className="flex justify-center my-4">
                        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-xl p-4 max-w-md w-full shadow-sm">
                          <div className="text-center mb-3">
                            <div className="font-semibold text-lg mb-1">
                              Rate Your Transaction with {msg.targetUsername}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              How was your experience?
                            </div>
                          </div>
                          <div className="flex gap-3 justify-center">
                            <Button
                              onClick={() => handleSubmitRating(true, msg.transactionId)}
                              className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
                            >
                              <ThumbsUp className="h-5 w-5" />
                              Positive
                            </Button>
                            <Button
                              onClick={() => handleSubmitRating(false, msg.transactionId)}
                              className="flex items-center gap-2 bg-red-600 hover:bg-red-700"
                            >
                              <ThumbsDown className="h-5 w-5" />
                              Negative
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  
                  // System message for rating thanks
                  if (msg.type === "rating_thanks") {
                    return (
                      <div key={msg.id} className="flex justify-center my-4">
                        <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-xl p-3 max-w-md shadow-sm">
                          <div className="flex items-center gap-2 justify-center text-green-700">
                            <Star className="h-5 w-5 fill-current" />
                            <span className="font-semibold">
                              Thank you for your {msg.thumbsUp ? 'positive' : ''} rating!
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  
                  // Regular user message
                  const isOwn = msg.senderId === user.uid;
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-2 items-start ${isOwn ? 'justify-end' : 'justify-start'} group`}
                    >
                      {isOwn && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDeleteMessage(msg.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 h-8 w-8"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      )}
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                          isOwn
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        {msg.imageUrl && (
                          <img
                            src={msg.imageUrl}
                            alt="Shared image"
                            className="rounded-lg mb-2 max-w-full cursor-pointer hover:opacity-80 transition"
                            onClick={() => setZoomedImage(msg.imageUrl)}
                          />
                        )}
                        {msg.text && <div>{msg.text}</div>}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Transaction Status */}
              {transaction && (
                <div className={`px-4 py-3 border-t ${
                  transaction.status === "cancelled" 
                    ? 'bg-red-50' 
                    : transaction.status === "completed"
                    ? 'bg-green-50'
                    : 'bg-gradient-to-r from-blue-50 to-purple-50'
                }`}>
                  {transaction.status === "cancelled" ? (
                    <div className="flex items-center gap-2 text-red-600 font-semibold text-sm">
                      <XCircle className="h-5 w-5" />
                      Transaction Cancelled
                    </div>
                  ) : transaction.status === "completed" ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-green-600 font-semibold text-sm">
                        <CheckCircle className="h-5 w-5" />
                        Transaction Completed
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleStartNewTransaction}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Start New Transaction
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-gray-700">
                        {transaction.status === "buyer_confirmed" && "✓ Buyer has marked this transaction as completed"}
                        {transaction.status === "seller_confirmed" && "✓ Seller has marked this transaction as completed"}
                        {transaction.status === "pending" && "Transaction pending confirmation"}
                      </div>
                      <div className="flex gap-2">
                        {((transaction.status === "buyer_confirmed" && user.uid === transaction.sellerId) ||
                          (transaction.status === "seller_confirmed" && user.uid === transaction.buyerId) ||
                          (transaction.status === "pending")) && (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={handleMarkAsCompleted}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Confirm Completion
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={handleCancelTransaction}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Cancel Transaction
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {!transaction && selectedConversation && (
                <div className="px-4 py-2 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleMarkAsCompleted}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Mark Transaction as Completed
                  </Button>
                </div>
              )}

              {/* Input */}
              <div className="p-4 border-t">
                {imagePreview && (
                  <div className="mb-2 relative inline-block">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="h-20 w-20 object-cover rounded-lg"
                    />
                    <button
                      onClick={() => {
                        setImageFile(null);
                        setImagePreview(null);
                      }}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                  >
                    <ImageIcon className="h-4 w-4" />
                  </Button>
                  <Input
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Type a message..."
                    disabled={uploadingImage}
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={(!messageText.trim() && !imageFile) || uploadingImage}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Select a conversation to start messaging
            </div>
          )}
        </Card>
      </div>

      {/* Image Zoom Modal */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setZoomedImage(null)}
        >
          <div className="relative max-w-7xl max-h-[90vh]">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 text-white hover:bg-white/20"
              onClick={() => setZoomedImage(null)}
            >
              <X className="h-6 w-6" />
            </Button>
            <img
              src={zoomedImage}
              alt="Zoomed image"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}

