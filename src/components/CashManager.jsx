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
  Smartphone
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
  cashData = { physical: [], digital: [] }, 
  onUpdate, 
  primaryCurrency = 'USD',
  isCollapsed = false,
  onToggleCollapse 
}) {
  const [collapsed, setCollapsed] = useState(isCollapsed);
  const [showAddPhysical, setShowAddPhysical] = useState(false);
  const [showAddDigital, setShowAddDigital] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  
  // New entry states
  const [newPhysicalCurrency, setNewPhysicalCurrency] = useState('USD');
  const [newPhysicalAmount, setNewPhysicalAmount] = useState("");
  const [newDigitalPlatform, setNewDigitalPlatform] = useState('paypal');
  const [newDigitalCurrency, setNewDigitalCurrency] = useState('USD');
  const [newDigitalAmount, setNewDigitalAmount] = useState("");
  const [newDigitalNote, setNewDigitalNote] = useState("");

  const physicalCash = cashData.physical || [];
  const digitalCash = cashData.digital || [];

  // Calculate totals in primary currency
  const physicalTotal = physicalCash.reduce((sum, entry) => {
    return sum + convertCurrency(entry.amount, primaryCurrency, entry.currency);
  }, 0);

  const digitalTotal = digitalCash.reduce((sum, entry) => {
    return sum + convertCurrency(entry.amount, primaryCurrency, entry.currency);
  }, 0);

  const grandTotal = physicalTotal + digitalTotal;

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

  const handleDelete = (type, id) => {
    if (type === 'physical') {
      const updated = {
        ...cashData,
        physical: physicalCash.filter(e => e.id !== id)
      };
      onUpdate(updated);
    } else {
      const updated = {
        ...cashData,
        digital: digitalCash.filter(e => e.id !== id)
      };
      onUpdate(updated);
    }
  };

  const handleEdit = (type, id, newAmount) => {
    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount < 0) return;
    
    if (type === 'physical') {
      const updated = {
        ...cashData,
        physical: physicalCash.map(e => 
          e.id === id ? { ...e, amount } : e
        )
      };
      onUpdate(updated);
    } else {
      const updated = {
        ...cashData,
        digital: digitalCash.map(e => 
          e.id === id ? { ...e, amount } : e
        )
      };
      onUpdate(updated);
    }
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
            <span className="text-lg font-bold text-green-600">
              {formatCurrency(grandTotal, primaryCurrency)}
            </span>
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
        </CardContent>
      )}
    </Card>
  );
}
