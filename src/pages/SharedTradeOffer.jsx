import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Clock, User, AlertCircle, MessageCircle } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { formatCurrency, convertCurrency, getConditionDisplayLabel } from "@/utils/cardHelpers";
import { getDoc, doc } from "firebase/firestore";

/**
 * Shared Trade Offer View (Read-only)
 * Displays a trade offer when accessed via ?id={offerId}
 */

export function SharedTradeOffer() {
  const { db, currency } = useApp();
  const [searchParams] = useSearchParams();
  const offerId = searchParams.get("id");
  
  const [offer, setOffer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expired, setExpired] = useState(false);

  // Load trade offer
  useEffect(() => {
    if (!db || !offerId) {
      setLoading(false);
      setError("Invalid trade offer link");
      return;
    }

    const loadOffer = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const offerRef = doc(db, "tradeOffers", offerId);
        const offerSnap = await getDoc(offerRef);
        
        if (!offerSnap.exists()) {
          setError("Trade offer not found");
          setLoading(false);
          return;
        }
        
        const offerData = offerSnap.data();
        
        // Check if expired
        if (offerData.expiresAt && Date.now() > offerData.expiresAt) {
          setExpired(true);
        }
        
        setOffer(offerData);
      } catch (err) {
        console.error("Failed to load trade offer:", err);
        setError("Failed to load trade offer");
      } finally {
        setLoading(false);
      }
    };

    loadOffer();
  }, [db, offerId]);

  // Format price with user's currency preference
  const formatPrice = (value, originalCurrency) => {
    // Convert from offer's currency to viewer's currency if different
    if (originalCurrency && originalCurrency !== currency) {
      const converted = convertCurrency(value, currency, originalCurrency);
      return formatCurrency(converted, currency);
    }
    return formatCurrency(value, currency);
  };

  // Calculate total in viewer's currency
  const getTotalInViewerCurrency = () => {
    if (!offer) return 0;
    if (offer.currency && offer.currency !== currency) {
      return convertCurrency(offer.totalValue, currency, offer.currency);
    }
    return offer.totalValue;
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <Card className="rounded-2xl">
          <CardContent className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-muted-foreground">Loading trade offer...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <Card className="rounded-2xl border-red-200 bg-red-50">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-red-700 mb-2">Oops!</h2>
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!offer) return null;

  const createdDate = new Date(offer.createdAt).toLocaleDateString();
  const expiresDate = offer.expiresAt ? new Date(offer.expiresAt).toLocaleDateString() : null;

  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Header */}
      <div className="mb-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Package className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold">Trade Offer</h1>
        </div>
        <p className="text-muted-foreground">
          from <span className="font-semibold text-foreground">{offer.vendorName}</span>
        </p>
      </div>

      {/* Expired Warning */}
      {expired && (
        <Card className="rounded-2xl border-yellow-300 bg-yellow-50 mb-4">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-6 w-6 text-yellow-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-yellow-800">This offer has expired</p>
              <p className="text-sm text-yellow-700">
                Contact {offer.vendorName} if you're still interested in trading.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vendor Info */}
      <Card className="rounded-2xl mb-4">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            {offer.vendorAvatar ? (
              <img
                src={offer.vendorAvatar}
                alt={offer.vendorName}
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                <User className="h-6 w-6 text-white" />
              </div>
            )}
            <div>
              <p className="font-semibold">{offer.vendorName}</p>
              <p className="text-sm text-muted-foreground">
                Created {createdDate}
                {expiresDate && !expired && ` • Valid until ${expiresDate}`}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Total Value Banner */}
      <Card className="rounded-2xl mb-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white">
        <CardContent className="p-6 text-center">
          <p className="text-sm uppercase tracking-wide opacity-90 mb-1">Total Offer Value</p>
          <p className="text-4xl font-bold">
            {formatCurrency(getTotalInViewerCurrency(), currency)}
          </p>
          {offer.currency && offer.currency !== currency && (
            <p className="text-sm opacity-80 mt-1">
              (Originally {formatCurrency(offer.totalValue, offer.currency)})
            </p>
          )}
        </CardContent>
      </Card>

      {/* Cards List */}
      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Package className="h-5 w-5" />
            Cards in this offer ({offer.items?.length || 0})
          </h2>
          
          <div className="space-y-3">
            {offer.items?.map((item, index) => (
              <div
                key={index}
                className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 border"
              >
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-20 w-14 rounded-lg object-cover flex-shrink-0 shadow-md"
                  />
                ) : (
                  <div className="h-20 w-14 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                    <Package className="h-6 w-6 text-gray-400" />
                  </div>
                )}
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{item.name}</h3>
                  <p className="text-sm text-muted-foreground truncate">
                    {item.set} {item.number && `#${item.number}`}
                  </p>
                  
                  {item.isGraded ? (
                    <div className="mt-1">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-yellow-100 to-amber-100 text-yellow-800 border border-yellow-300">
                        🏆 {item.gradingCompany} {item.grade}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-1">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border">
                        {getConditionDisplayLabel(item.condition || "NM")}
                      </span>
                    </div>
                  )}
                </div>
                
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold text-green-600">
                    {formatPrice(item.tradeValue, offer.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    @ {item.tradePct}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Contact CTA */}
      <Card className="rounded-2xl mt-4 border-blue-200 bg-blue-50">
        <CardContent className="p-4 text-center">
          <MessageCircle className="h-8 w-8 text-blue-600 mx-auto mb-2" />
          <p className="font-semibold text-blue-800">Interested in this trade?</p>
          <p className="text-sm text-blue-700">
            Contact {offer.vendorName} to discuss the details!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default SharedTradeOffer;

