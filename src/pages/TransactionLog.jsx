import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollText, ArrowUpRight, ArrowDownLeft, ChevronDown, ChevronRight, DollarSign, Trash2, Edit2, Plus, X } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { collection as fsCollection, query, orderBy, limit, getDocs, deleteDoc, doc, addDoc, setDoc } from "firebase/firestore";
import { formatCurrency } from "@/utils/cardHelpers";

/**
 * Transaction Log Page (Vendor Toolkit)
 * Displays chronological list of all trades and purchases
 */

export function TransactionLog() {
  const { user, db, currency } = useApp();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedTx, setExpandedTx] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTx, setEditingTx] = useState(null); // Track which transaction is being edited
  const [editedItemsIn, setEditedItemsIn] = useState([]); // Temporary storage for edited itemsIn
  const [newEntry, setNewEntry] = useState({
    type: 'sale',
    totalValue: '',
    notes: ''
  });

  const loadTransactions = async () => {
    if (!user || !db) {
      setLoading(false);
      return;
    }

    try {
      const col = fsCollection(db, "transactions", user.uid, "entries");
      const q = query(col, orderBy("ts", "desc"), limit(100));
      const snapshot = await getDocs(q);
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTransactions(items);
    } catch (err) {
      console.error("Failed to load transactions", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, [user, db]);
  
  const toggleExpanded = (txId) => {
    setExpandedTx(expandedTx === txId ? null : txId);
  };
  
  const handleDeleteTransaction = async (txId) => {
    // Delete directly without confirmation
    
    try {
      await deleteDoc(doc(db, "transactions", user.uid, "entries", txId));
      setTransactions(prev => prev.filter(tx => tx.id !== txId));
      // Silent delete - no alert
    } catch (error) {
      console.error("Failed to delete transaction:", error);
      alert("Failed to delete transaction. Please try again.");
    }
  };
  
  const handleAddTransaction = async () => {
    if (!newEntry.totalValue || isNaN(parseFloat(newEntry.totalValue))) {
      alert("Please enter a valid amount");
      return;
    }
    
    try {
      const col = fsCollection(db, "transactions", user.uid, "entries");
      await addDoc(col, {
        type: newEntry.type,
        totalValue: parseFloat(newEntry.totalValue),
        notes: newEntry.notes || `Manual ${newEntry.type} entry`,
        currency: currency,
        ts: Date.now(),
        itemsIn: [],
        itemsOut: []
      });
      
      setShowAddModal(false);
      setNewEntry({ type: 'sale', totalValue: '', notes: '' });
      await loadTransactions();
      alert("Transaction added successfully");
    } catch (error) {
      console.error("Failed to add transaction:", error);
      alert("Failed to add transaction. Please try again.");
    }
  };

  const handleStartEdit = (tx) => {
    setEditingTx(tx.id);
    setEditedItemsIn(JSON.parse(JSON.stringify(tx.itemsIn || []))); // Deep copy
  };

  const handleCancelEdit = () => {
    setEditingTx(null);
    setEditedItemsIn([]);
  };

  const handleUpdateItemPrice = (index, newPrice) => {
    const updated = [...editedItemsIn];
    const price = parseFloat(newPrice);
    if (!isNaN(price)) {
      updated[index].unitPrice = price;
      updated[index].totalPrice = price * (updated[index].quantity || 1);
      setEditedItemsIn(updated);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingTx || !user || !db) return;

    try {
      const txRef = doc(db, "transactions", user.uid, "entries", editingTx);
      const tx = transactions.find(t => t.id === editingTx);
      
      // Calculate new total value based on edited items
      const newTotalValue = editedItemsIn.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
      
      await setDoc(txRef, {
        itemsIn: editedItemsIn,
        totalValue: newTotalValue
      }, { merge: true });

      setEditingTx(null);
      setEditedItemsIn([]);
      await loadTransactions();
      alert("Transaction updated successfully");
    } catch (error) {
      console.error("Failed to update transaction:", error);
      alert("Failed to update transaction. Please try again.");
    }
  };

  if (!user) {
    return (
      <div className="max-w-6xl mx-auto">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Please sign in to view transaction history.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ScrollText className="h-8 w-8 text-green-600" />
          <div>
            <h1 className="text-3xl font-bold">Transaction Log</h1>
            <p className="text-muted-foreground">Vendor Toolkit</p>
          </div>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Entry
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading transactions...</div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8">
              <ScrollText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No transactions recorded yet.</p>
              <p className="text-sm text-muted-foreground mt-2">
                Complete trades or purchases to see them here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.map(tx => {
                const isExpanded = expandedTx === tx.id;
                const hasCards = (tx.itemsOut && tx.itemsOut.length > 0) || (tx.itemsIn && tx.itemsIn.length > 0);
                
                return (
                  <div
                    key={tx.id}
                    className={`border rounded-lg transition-all ${isExpanded ? 'bg-accent/30' : 'hover:bg-accent/50'}`}
                  >
                    <div className="flex items-start gap-3 p-4">
                      <div className={`p-2 rounded-lg ${tx.type === 'trade' ? 'bg-blue-100' : 'bg-green-100'}`}>
                        {tx.type === 'trade' ? (
                          <ArrowUpRight className="h-5 w-5 text-blue-600" />
                        ) : (
                          <DollarSign className="h-5 w-5 text-green-600" />
                        )}
                      </div>
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => hasCards && toggleExpanded(tx.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-semibold capitalize flex items-center gap-2">
                              {tx.type || 'Transaction'}
                              {hasCards && (
                                isExpanded ? 
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" /> : 
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {new Date(tx.ts).toLocaleString()}
                            </div>
                          </div>
                          <div className="text-right">
                            {tx.totalValue != null && (
                              <div className="font-semibold">{formatCurrency(tx.totalValue, tx.currency || currency)}</div>
                            )}
                            {(tx.type === 'trade' || tx.type === 'buy') && tx.valueGained != null && (
                              <div className={`text-sm font-semibold ${tx.valueGained >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {tx.valueGained >= 0 ? '+' : ''}{formatCurrency(tx.valueGained, tx.currency || currency)} gained
                              </div>
                            )}
                            <div className="text-sm text-muted-foreground">
                              {tx.itemsIn?.length || 0} in / {tx.itemsOut?.length || 0} out
                            </div>
                          </div>
                        </div>
                        {tx.notes && !isExpanded && (
                          <div className="text-sm text-muted-foreground mt-1">{tx.notes}</div>
                        )}
                        
                        {/* Card Images Preview */}
                        {!isExpanded && (
                          <div className="mt-2 space-y-2">
                            {/* Cards Out (Sold/Traded Away) */}
                            {tx.itemsOut && tx.itemsOut.length > 0 && (
                              <div>
                                <div className="text-xs font-semibold text-red-600 mb-1">Out:</div>
                                <div className="flex gap-1">
                                  {tx.itemsOut.slice(0, 5).map((card, idx) => {
                                    const imageUrl = card.image || card.imageUrl;
                                    return imageUrl ? (
                                      <img
                                        key={idx}
                                        src={imageUrl}
                                        alt={card.name}
                                        className="h-12 w-9 object-cover rounded border-2 border-red-300 shadow-sm"
                                        onError={(e) => { e.target.style.display = 'none'; }}
                                      />
                                    ) : null;
                                  })}
                                  {tx.itemsOut.length > 5 && (
                                    <div className="h-12 w-9 flex items-center justify-center bg-red-50 rounded border-2 border-red-300 text-xs font-semibold text-red-700">
                                      +{tx.itemsOut.length - 5}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {/* Cards In (Acquired) */}
                            {tx.itemsIn && tx.itemsIn.length > 0 && (
                              <div>
                                <div className="text-xs font-semibold text-green-600 mb-1">In:</div>
                                <div className="flex gap-1">
                                  {tx.itemsIn.slice(0, 5).map((card, idx) => {
                                    const imageUrl = card.image || card.imageUrl;
                                    return imageUrl ? (
                                      <img
                                        key={idx}
                                        src={imageUrl}
                                        alt={card.name}
                                        className="h-12 w-9 object-cover rounded border-2 border-green-300 shadow-sm"
                                        onError={(e) => { e.target.style.display = 'none'; }}
                                      />
                                    ) : null;
                                  })}
                                  {tx.itemsIn.length > 5 && (
                                    <div className="h-12 w-9 flex items-center justify-center bg-green-50 rounded border-2 border-green-300 text-xs font-semibold text-green-700">
                                      +{tx.itemsIn.length - 5}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTransaction(tx.id);
                        }}
                        className="flex-shrink-0"
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                    
                    {/* Expanded Details */}
                    {isExpanded && hasCards && (
                      <div className="px-4 pb-4 border-t pt-3">
                        {tx.itemsOut && tx.itemsOut.length > 0 && (
                          <div className="mb-3">
                            <div className="text-sm font-semibold mb-2 text-red-600">Cards Sold:</div>
                            <div className="space-y-2">
                              {tx.itemsOut.map((card, idx) => {
                                const imageUrl = card.image || card.imageUrl;
                                return (
                                  <div key={idx} className="flex items-center gap-3 text-sm bg-red-50 p-2 rounded">
                                    {imageUrl && (
                                      <img
                                        src={imageUrl}
                                        alt={card.name}
                                        className="h-16 w-12 object-cover rounded border shadow-sm flex-shrink-0"
                                        onError={(e) => { e.target.style.display = 'none'; }}
                                      />
                                    )}
                                    <div className="flex-1 flex justify-between items-center">
                                      <div>
                                        <span className="font-medium">{card.name}</span>
                                        <span className="text-muted-foreground ml-2">
                                          ({card.set} #{card.number}) • {card.isGraded && card.gradingCompany && card.grade ? (
                                            <span className="text-yellow-600 font-semibold">{card.gradingCompany} {card.grade}</span>
                                          ) : (
                                            card.condition
                                          )}
                                          {card.quantity > 1 && ` • Qty: ${card.quantity}`}
                                        </span>
                                      </div>
                                      {card.unitPrice != null && (
                                        <div className="text-right">
                                          <div className="font-semibold">
                                            {formatCurrency(card.unitPrice, tx.currency || currency)}
                                            {card.quantity > 1 && <span className="text-xs text-muted-foreground"> ea</span>}
                                          </div>
                                          {card.quantity > 1 && (
                                            <div className="text-xs text-muted-foreground">
                                              Total: {formatCurrency(card.totalPrice || (card.unitPrice * card.quantity), tx.currency || currency)}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        
                        {tx.itemsIn && tx.itemsIn.length > 0 && (
                          <div>
                            <div className="text-sm font-semibold mb-2 text-green-600 flex items-center justify-between">
                              <span>Cards Acquired:</span>
                              {editingTx !== tx.id && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleStartEdit(tx)}
                                  className="h-7"
                                >
                                  <Edit2 className="h-3 w-3 mr-1" />
                                  Edit Prices
                                </Button>
                              )}
                            </div>
                            <div className="space-y-2">
                              {(editingTx === tx.id ? editedItemsIn : tx.itemsIn).map((card, idx) => {
                                const imageUrl = card.image || card.imageUrl;
                                const isEditing = editingTx === tx.id;
                                return (
                                  <div key={idx} className="flex items-center gap-3 text-sm bg-green-50 p-2 rounded">
                                    {imageUrl && (
                                      <img
                                        src={imageUrl}
                                        alt={card.name}
                                        className="h-16 w-12 object-cover rounded border shadow-sm flex-shrink-0"
                                        onError={(e) => { e.target.style.display = 'none'; }}
                                      />
                                    )}
                                    <div className="flex-1 flex justify-between items-center">
                                      <div>
                                        <span className="font-medium">{card.name}</span>
                                        <span className="text-muted-foreground ml-2">
                                          ({card.set} #{card.number}) • {card.isGraded && card.gradingCompany && card.grade ? (
                                            <span className="text-yellow-600 font-semibold">{card.gradingCompany} {card.grade}</span>
                                          ) : (
                                            card.condition
                                          )}
                                          {card.quantity > 1 && ` • Qty: ${card.quantity}`}
                                        </span>
                                      </div>
                                      {card.unitPrice != null && (
                                        <div className="text-right">
                                          {isEditing ? (
                                            <div className="flex items-center gap-2">
                                              <Input
                                                type="number"
                                                step="0.01"
                                                value={card.unitPrice}
                                                onChange={(e) => handleUpdateItemPrice(idx, e.target.value)}
                                                className="w-24 h-8 text-sm"
                                              />
                                              {card.quantity > 1 && (
                                                <span className="text-xs text-muted-foreground">
                                                  × {card.quantity} = {formatCurrency(card.totalPrice, tx.currency || currency)}
                                                </span>
                                              )}
                                            </div>
                                          ) : (
                                            <>
                                              <div className="font-semibold">
                                                {formatCurrency(card.unitPrice, tx.currency || currency)}
                                                {card.quantity > 1 && <span className="text-xs text-muted-foreground"> ea</span>}
                                              </div>
                                              {card.quantity > 1 && (
                                                <div className="text-xs text-muted-foreground">
                                                  Total: {formatCurrency(card.totalPrice || (card.unitPrice * card.quantity), tx.currency || currency)}
                                                </div>
                                              )}
                                            </>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {editingTx === tx.id && (
                              <div className="flex gap-2 mt-3 justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={handleCancelEdit}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={handleSaveEdit}
                                  className="bg-green-600 hover:bg-green-700"
                                >
                                  Save Changes
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Cash Component in Trade */}
                        {tx.cashAmount && (
                          <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                            <div className="text-sm font-semibold text-purple-700">
                              💵 Cash {tx.cashDirection === 'in' ? 'Received' : 'Paid'}: {formatCurrency(tx.cashAmount, tx.currency || currency)}
                            </div>
                          </div>
                        )}
                        
                        {tx.notes && (
                          <div className="text-sm text-muted-foreground mt-3 italic border-t pt-2">
                            {tx.notes}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Add Transaction Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Add Manual Transaction</h2>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setShowAddModal(false);
                    setNewEntry({ type: 'sale', totalValue: '', notes: '' });
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Transaction Type</label>
                  <select
                    value={newEntry.type}
                    onChange={(e) => setNewEntry({ ...newEntry, type: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="sale">Sale</option>
                    <option value="trade">Trade</option>
                    <option value="purchase">Purchase</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Amount ({currency})</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newEntry.totalValue}
                    onChange={(e) => setNewEntry({ ...newEntry, totalValue: e.target.value })}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Notes (Optional)</label>
                  <Input
                    type="text"
                    placeholder="Add details about this transaction..."
                    value={newEntry.notes}
                    onChange={(e) => setNewEntry({ ...newEntry, notes: e.target.value })}
                  />
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddModal(false);
                    setNewEntry({ type: 'sale', totalValue: '', notes: '' });
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button onClick={handleAddTransaction} className="flex-1">
                  Add Transaction
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

