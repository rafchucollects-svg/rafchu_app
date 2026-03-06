import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Wallet, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  ChevronDown, 
  ChevronUp,
  Banknote,
  Smartphone,
  Clock
} from "lucide-react";
import { formatCurrency, convertCurrency } from "@/utils/cardHelpers";

// Physical currencies
const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸' },
  { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', flag: '🇯🇵' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', flag: '🇨🇦' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', flag: '🇦🇺' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr', flag: '🇨🇭' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr', flag: '🇩🇰' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', flag: '🇸🇪' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', flag: '🇳🇴' },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$', flag: '🇲🇽' },
];

// Digital payment platforms
const DIGITAL_PLATFORMS = [
  { id: 'paypal', name: 'PayPal', icon: '💳', color: 'bg-blue-500' },
  { id: 'revolut', name: 'Revolut', icon: '🔄', color: 'bg-purple-500' },
  { id: 'wise', name: 'Wise', icon: '🌍', color: 'bg-green-500' },
  { id: 'mobilepay', name: 'MobilePay', icon: '📱', color: 'bg-blue-600' },
  { id: 'venmo', name: 'Venmo', icon: '💸', color: 'bg-blue-400' },
  { id: 'cashapp', name: 'Cash App', icon: '💵', color: 'bg-green-600' },
  { id: 'zelle', name: 'Zelle', icon: '⚡', color: 'bg-purple-600' },
  { id: 'applepay', name: 'Apple Pay', icon: '🍎', color: 'bg-gray-800' },
  { id: 'googlepay', name: 'Google Pay', icon: '🔵', color: 'bg-red-500' },
  { id: 'other', name: 'Other', icon: '💰', color: 'bg-gray-500' },
];

export function CashManager({ 
  cashData = { physical: [], digital: [], pending: [] }, 
  onUpdate, 
  primaryCurrency = 'USD',
  isCollapsed = false,
  onToggleCollapse 
}) {
  const [collapsed, setCollapsed] = useState(isCollapsed);
  const [showAddPhysical, setShowAddPhysical] = useState(false);
  const [showAddDigital, setShowAddDigital] = useState(false);
  const [showAddPending, setShowAddPending] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  
  // New entry states
  const [newPhysicalCurrency, setNewPhysicalCurrency] = useState('USD');
  const [newPhysicalAmount, setNewPhysicalAmount] = useState("");
  const [newDigitalPlatform, setNewDigitalPlatform] = useState('paypal');
  const [newDigitalCurrency, setNewDigitalCurrency] = useState('USD');
  const [newDigitalAmount, setNewDigitalAmount] = useState("");
  const [newDigitalNote, setNewDigitalNote] = useState("");
  // Pending entry states
  const [newPendingPlatform, setNewPendingPlatform] = useState('paypal');
  const [newPendingCurrency, setNewPendingCurrency] = useState('USD');
  const [newPendingAmount, setNewPendingAmount] = useState("");
  const [newPendingNote, setNewPendingNote] = useState("");

  const physicalCash = cashData.physical || [];
  const digitalCash = cashData.digital || [];
  const pendingCash = cashData.pending || [];

  // Calculate totals in primary currency
  const physicalTotal = physicalCash.reduce((sum, entry) => {
    return sum + convertCurrency(entry.amount, primaryCurrency, entry.currency);
  }, 0);

  const digitalTotal = digitalCash.reduce((sum, entry) => {
    return sum + convertCurrency(entry.amount, primaryCurrency, entry.currency);
  }, 0);

  const pendingTotal = pendingCash.reduce((sum, entry) => {
    return sum + convertCurrency(entry.amount, primaryCurrency, entry.currency);
  }, 0);

  const grandTotal = physicalTotal + digitalTotal;
  const projectedTotal = grandTotal + pendingTotal;

  const handleAddPhysical = () => {
    if (!newPhysicalAmount || parseFloat(newPhysicalAmount) <= 0) return;
    
    const newEntry = {
      id: `physical-${Date.now()}`,
      currency: newPhysicalCurrency,
      amount: parseFloat(newPhysicalAmount),
      addedAt: Date.now()
    };
    
    const updated = {
      ...cashData,
      physical: [...physicalCash, newEntry]
    };
    
    onUpdate(updated);
    setNewPhysicalAmount("");
    setShowAddPhysical(false);
  };

  const handleAddDigital = () => {
    if (!newDigitalAmount || parseFloat(newDigitalAmount) <= 0) return;
    
    const newEntry = {
      id: `digital-${Date.now()}`,
      platform: newDigitalPlatform,
      currency: newDigitalCurrency,
      amount: parseFloat(newDigitalAmount),
      note: newDigitalNote.trim(),
      addedAt: Date.now()
    };
    
    const updated = {
      ...cashData,
      digital: [...digitalCash, newEntry]
    };
    
    onUpdate(updated);
    setNewDigitalAmount("");
    setNewDigitalNote("");
    setShowAddDigital(false);
  };

  const handleAddPending = () => {
    if (!newPendingAmount || parseFloat(newPendingAmount) <= 0) return;
    
    const newEntry = {
      id: `pending-${Date.now()}`,
      platform: newPendingPlatform,
      currency: newPendingCurrency,
      amount: parseFloat(newPendingAmount),
      note: newPendingNote.trim(),
      addedAt: Date.now()
    };
    
    const updated = {
      ...cashData,
      pending: [...pendingCash, newEntry]
    };
    
    onUpdate(updated);
    setNewPendingAmount("");
    setNewPendingNote("");
    setShowAddPending(false);
  };

  const handleReceivePending = (id) => {
    const entry = pendingCash.find(e => e.id === id);
    if (!entry) return;
    
    const digitalEntry = {
      id: `digital-${Date.now()}`,
      platform: entry.platform,
      currency: entry.currency,
      amount: entry.amount,
      note: entry.note ? `${entry.note} (received)` : "Received payment",
      addedAt: Date.now()
    };
    
    const updated = {
      ...cashData,
      digital: [...digitalCash, digitalEntry],
      pending: pendingCash.filter(e => e.id !== id)
    };
    
    onUpdate(updated);
  };

  const handleDelete = (type, id) => {
    const key = type;
    const list = key === 'physical' ? physicalCash : key === 'pending' ? pendingCash : digitalCash;
    const updated = {
      ...cashData,
      [key]: list.filter(e => e.id !== id)
    };
    onUpdate(updated);
  };

  const handleEdit = (type, id, newAmount) => {
    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount < 0) return;
    
    const key = type;
    const list = key === 'physical' ? physicalCash : key === 'pending' ? pendingCash : digitalCash;
    const updated = {
      ...cashData,
      [key]: list.map(e => e.id === id ? { ...e, amount } : e)
    };
    onUpdate(updated);
    setEditingId(null);
  };

  const getCurrencyInfo = (code) => CURRENCIES.find(c => c.code === code) || CURRENCIES[0];
  const getPlatformInfo = (id) => DIGITAL_PLATFORMS.find(p => p.id === id) || DIGITAL_PLATFORMS[DIGITAL_PLATFORMS.length - 1];

  const toggleCollapse = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    onToggleCollapse?.(newState);
  };

  return (
    <Card className="rounded-2xl shadow mb-4">
      <CardHeader 
        className="cursor-pointer hover:bg-muted/50 transition-colors rounded-t-2xl"
        onClick={toggleCollapse}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-green-600" />
            <CardTitle className="text-lg">Cash Balance</CardTitle>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-lg font-bold text-green-600">
                {formatCurrency(grandTotal, primaryCurrency)}
              </span>
              {pendingTotal > 0 && (
                <div className="text-xs text-amber-600 font-medium">
                  +{formatCurrency(pendingTotal, primaryCurrency)} pending
                </div>
              )}
            </div>
            {collapsed ? (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>
      
      {!collapsed && (
        <CardContent className="pt-0">
          {/* Physical Cash Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Banknote className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Physical Cash</span>
                <span className="text-sm text-muted-foreground">
                  ({formatCurrency(physicalTotal, primaryCurrency)})
                </span>
              </div>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => setShowAddPhysical(!showAddPhysical)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
            
            {/* Add Physical Cash Form */}
            {showAddPhysical && (
              <div className="flex gap-2 mb-3 p-3 bg-muted/50 rounded-lg">
                <select
                  className="rounded-md border px-2 py-1.5 text-sm"
                  value={newPhysicalCurrency}
                  onChange={(e) => setNewPhysicalCurrency(e.target.value)}
                >
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  placeholder="Amount"
                  value={newPhysicalAmount}
                  onChange={(e) => setNewPhysicalAmount(e.target.value)}
                  className="w-32"
                  min="0"
                  step="0.01"
                />
                <Button size="sm" onClick={handleAddPhysical}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAddPhysical(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            
            {/* Physical Cash List */}
            {physicalCash.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No physical cash added</p>
            ) : (
              <div className="space-y-2">
                {physicalCash.map(entry => {
                  const currencyInfo = getCurrencyInfo(entry.currency);
                  const isEditing = editingId === entry.id;
                  
                  return (
                    <div 
                      key={entry.id} 
                      className="flex items-center justify-between p-2 bg-muted/30 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <span>{currencyInfo.flag}</span>
                        <span className="font-medium">{entry.currency}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <Input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-24 h-8"
                              min="0"
                              step="0.01"
                              autoFocus
                            />
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => handleEdit('physical', entry.id, editValue)}
                            >
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="font-semibold">
                              {currencyInfo.symbol}{entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              ≈ {formatCurrency(convertCurrency(entry.amount, primaryCurrency, entry.currency), primaryCurrency)}
                            </span>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => {
                                setEditingId(entry.id);
                                setEditValue(entry.amount.toString());
                              }}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => handleDelete('physical', entry.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* Digital Cash Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Digital Balances</span>
                <span className="text-sm text-muted-foreground">
                  ({formatCurrency(digitalTotal, primaryCurrency)})
                </span>
              </div>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => setShowAddDigital(!showAddDigital)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
            
            {/* Add Digital Cash Form */}
            {showAddDigital && (
              <div className="flex flex-wrap gap-2 mb-3 p-3 bg-muted/50 rounded-lg">
                <select
                  className="rounded-md border px-2 py-1.5 text-sm"
                  value={newDigitalPlatform}
                  onChange={(e) => setNewDigitalPlatform(e.target.value)}
                >
                  {DIGITAL_PLATFORMS.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.icon} {p.name}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-md border px-2 py-1.5 text-sm"
                  value={newDigitalCurrency}
                  onChange={(e) => setNewDigitalCurrency(e.target.value)}
                >
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  placeholder="Amount"
                  value={newDigitalAmount}
                  onChange={(e) => setNewDigitalAmount(e.target.value)}
                  className="w-28"
                  min="0"
                  step="0.01"
                />
                <Input
                  type="text"
                  placeholder="Note (optional)"
                  value={newDigitalNote}
                  onChange={(e) => setNewDigitalNote(e.target.value)}
                  className="w-36"
                  maxLength={30}
                />
                <Button size="sm" onClick={handleAddDigital}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAddDigital(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            
            {/* Digital Cash List */}
            {digitalCash.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No digital balances added</p>
            ) : (
              <div className="space-y-2">
                {digitalCash.map(entry => {
                  const platformInfo = getPlatformInfo(entry.platform);
                  const currencyInfo = getCurrencyInfo(entry.currency);
                  const isEditing = editingId === entry.id;
                  
                  return (
                    <div 
                      key={entry.id} 
                      className="flex items-center justify-between p-2 bg-muted/30 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-white text-xs ${platformInfo.color}`}>
                          {platformInfo.icon} {platformInfo.name}
                        </span>
                        {entry.note && (
                          <span className="text-xs text-muted-foreground">
                            ({entry.note})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <Input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-24 h-8"
                              min="0"
                              step="0.01"
                              autoFocus
                            />
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => handleEdit('digital', entry.id, editValue)}
                            >
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="font-semibold">
                              {currencyInfo.symbol}{entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-xs text-muted-foreground">{entry.currency}</span>
                            <span className="text-sm text-muted-foreground">
                              ≈ {formatCurrency(convertCurrency(entry.amount, primaryCurrency, entry.currency), primaryCurrency)}
                            </span>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => {
                                setEditingId(entry.id);
                                setEditValue(entry.amount.toString());
                              }}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => handleDelete('digital', entry.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pending Payments Section */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                <span className="font-medium">Pending Payments</span>
                <span className="text-sm text-amber-600">
                  ({formatCurrency(pendingTotal, primaryCurrency)})
                </span>
              </div>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => setShowAddPending(!showAddPending)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>

            {/* Add Pending Form */}
            {showAddPending && (
              <div className="flex flex-wrap gap-2 mb-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <select
                  className="rounded-md border px-2 py-1.5 text-sm"
                  value={newPendingPlatform}
                  onChange={(e) => setNewPendingPlatform(e.target.value)}
                >
                  {DIGITAL_PLATFORMS.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.icon} {p.name}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-md border px-2 py-1.5 text-sm"
                  value={newPendingCurrency}
                  onChange={(e) => setNewPendingCurrency(e.target.value)}
                >
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  placeholder="Amount"
                  value={newPendingAmount}
                  onChange={(e) => setNewPendingAmount(e.target.value)}
                  className="w-28"
                  min="0"
                  step="0.01"
                />
                <Input
                  type="text"
                  placeholder="From whom / note"
                  value={newPendingNote}
                  onChange={(e) => setNewPendingNote(e.target.value)}
                  className="w-40"
                  maxLength={40}
                />
                <Button size="sm" onClick={handleAddPending}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAddPending(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Pending List */}
            {pendingCash.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No pending payments</p>
            ) : (
              <div className="space-y-2">
                {pendingCash.map(entry => {
                  const platformInfo = getPlatformInfo(entry.platform);
                  const currencyInfo = getCurrencyInfo(entry.currency);
                  const isEditing = editingId === entry.id;
                  
                  return (
                    <div 
                      key={entry.id} 
                      className="flex items-center justify-between p-2 bg-amber-50/60 border border-amber-100 rounded-lg"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`px-2 py-0.5 rounded text-white text-xs flex-shrink-0 ${platformInfo.color}`}>
                          {platformInfo.icon} {platformInfo.name}
                        </span>
                        {entry.note && (
                          <span className="text-xs text-muted-foreground truncate">
                            {entry.note}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isEditing ? (
                          <>
                            <Input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-24 h-8"
                              min="0"
                              step="0.01"
                              autoFocus
                            />
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => handleEdit('pending', entry.id, editValue)}
                            >
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="font-semibold text-amber-700">
                              {currencyInfo.symbol}{entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-xs text-muted-foreground">{entry.currency}</span>
                            {entry.currency !== primaryCurrency && (
                              <span className="text-sm text-muted-foreground">
                                ≈ {formatCurrency(convertCurrency(entry.amount, primaryCurrency, entry.currency), primaryCurrency)}
                              </span>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleReceivePending(entry.id)}
                              title="Mark as received — moves to Digital Balances"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => {
                                setEditingId(entry.id);
                                setEditValue(entry.amount.toString());
                              }}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => handleDelete('pending', entry.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Projected Balance */}
          {pendingTotal > 0 && (
            <div className="mt-6 p-3 bg-gradient-to-r from-green-50 to-amber-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Balance after pending received
                </span>
                <span className="text-lg font-bold text-green-700">
                  {formatCurrency(projectedTotal, primaryCurrency)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
