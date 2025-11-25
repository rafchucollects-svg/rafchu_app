import { useEffect, useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PieChart, TrendingUp, ShoppingCart, Repeat, DollarSign } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { collection as fsCollection, getDocs } from "firebase/firestore";
import { formatCurrency } from "@/utils/cardHelpers";

/**
 * Transaction Summary Page (Vendor Toolkit)
 * Displays aggregated analytics and insights from transaction history
 */

export function TransactionSummary() {
  const { user, db } = useApp();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !db) {
      setLoading(false);
      return;
    }

    const loadTransactions = async () => {
      try {
        const col = fsCollection(db, "transactions", user.uid, "entries");
        const snapshot = await getDocs(col);
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

    loadTransactions();
  }, [user, db]);

  const summary = useMemo(() => {
    const trades = transactions.filter(tx => tx.type === 'trade');
    const buys = transactions.filter(tx => tx.type === 'buy');
    const sales = transactions.filter(tx => tx.type === 'sale');
    
    // Helper function to calculate graded vs ungraded breakdown per card type
    const calculateBreakdown = (txList, itemsKey = 'itemsOut') => {
      let gradedValue = 0;
      let ungradedValue = 0;
      let gradedCount = 0;
      let ungradedCount = 0;
      
      txList.forEach(tx => {
        // Sum up individual card values based on whether each card is graded
        const items = tx[itemsKey] || [];
        items.forEach(card => {
          const cardValue = card.totalPrice || card.unitPrice || 0;
          if (card.isGraded) {
            gradedValue += cardValue;
            gradedCount++;
          } else {
            ungradedValue += cardValue;
            ungradedCount++;
          }
        });
      });
      
      return { gradedValue, ungradedValue, gradedCount, ungradedCount };
    };
    
    const totalTradeValue = trades.reduce((sum, tx) => sum + (tx.totalValue || 0), 0);
    const totalBuyValue = buys.reduce((sum, tx) => sum + (tx.totalValue || 0), 0);
    const totalSaleValue = sales.reduce((sum, tx) => sum + (tx.totalValue || 0), 0);
    
    // Add cash received from trades to sales
    const cashFromTrades = trades.reduce((sum, tx) => {
      if (tx.cashAmount && tx.cashDirection === 'in') {
        return sum + tx.cashAmount;
      }
      return sum;
    }, 0);
    
    // Calculate value gained for trades and buys
    const tradeValueGained = trades.reduce((sum, tx) => sum + (tx.valueGained || 0), 0);
    const buyValueGained = buys.reduce((sum, tx) => sum + (tx.valueGained || 0), 0);
    const totalValueGained = tradeValueGained + buyValueGained;

    // Calculate graded/ungraded breakdowns per card
    const salesBreakdown = calculateBreakdown(sales, 'itemsOut'); // Cards sold
    const buysBreakdown = calculateBreakdown(buys, 'itemsIn'); // Cards acquired
    
    // For trades, we need to calculate based on market value of cards acquired (itemsIn)
    const tradesBreakdown = calculateBreakdown(trades, 'itemsIn');
    
    // For value gained, calculate market value - cost for each card type
    const calculateValueGainedBreakdown = (txList) => {
      let gradedGained = 0;
      let ungradedGained = 0;
      
      txList.forEach(tx => {
        const itemsIn = tx.itemsIn || [];
        itemsIn.forEach(card => {
          const marketValue = card.marketValue || card.totalPrice || card.unitPrice || 0;
          if (card.isGraded) {
            gradedGained += marketValue;
          } else {
            ungradedGained += marketValue;
          }
        });
        
        // Subtract the cost (itemsOut for trades)
        const itemsOut = tx.itemsOut || [];
        itemsOut.forEach(card => {
          const cost = card.marketValue || card.totalPrice || card.unitPrice || 0;
          if (card.isGraded) {
            gradedGained -= cost;
          } else {
            ungradedGained -= cost;
          }
        });
      });
      
      return { gradedValue: gradedGained, ungradedValue: ungradedGained };
    };
    
    const tradesGainedBreakdown = calculateValueGainedBreakdown(trades);
    
    // For buys, value gained is market value minus purchase cost
    // The cost is in totalValue, but we need to attribute it to cards
    const calculateBuyValueGainedBreakdown = (txList) => {
      let gradedGained = 0;
      let ungradedGained = 0;
      
      txList.forEach(tx => {
        const itemsIn = tx.itemsIn || [];
        const totalCost = tx.totalValue || 0;
        const totalMarketValue = itemsIn.reduce((sum, card) => sum + (card.marketValue || card.totalPrice || card.unitPrice || 0), 0);
        
        itemsIn.forEach(card => {
          const marketValue = card.marketValue || card.totalPrice || card.unitPrice || 0;
          // Proportionally allocate the cost based on market value
          const cardCost = totalMarketValue > 0 ? (marketValue / totalMarketValue) * totalCost : 0;
          const cardGain = marketValue - cardCost;
          
          if (card.isGraded) {
            gradedGained += cardGain;
          } else {
            ungradedGained += cardGain;
          }
        });
      });
      
      return { gradedValue: gradedGained, ungradedValue: ungradedGained };
    };
    
    const buysGainedBreakdown = calculateBuyValueGainedBreakdown(buys);

    // Card counts with graded/ungraded breakdown
    let cardsAcquiredGraded = 0;
    let cardsAcquiredUngraded = 0;
    let cardsTradedAwayGraded = 0;
    let cardsTradedAwayUngraded = 0;
    
    transactions.forEach(tx => {
      tx.itemsIn?.forEach(item => {
        if (item.isGraded) cardsAcquiredGraded++;
        else cardsAcquiredUngraded++;
      });
      tx.itemsOut?.forEach(item => {
        if (item.isGraded) cardsTradedAwayGraded++;
        else cardsTradedAwayUngraded++;
      });
    });

    const cardsAcquired = cardsAcquiredGraded + cardsAcquiredUngraded;
    const cardsTradedAway = cardsTradedAwayGraded + cardsTradedAwayUngraded;

    return {
      totalTransactions: transactions.length,
      totalTrades: trades.length,
      totalBuys: buys.length,
      totalSales: sales.length,
      totalTradeValue,
      totalBuyValue,
      totalSaleValue,
      cashFromTrades,
      tradeValueGained,
      buyValueGained,
      totalValueGained,
      cardsAcquired,
      cardsTradedAway,
      // Graded/Ungraded breakdowns
      salesBreakdown,
      tradesBreakdown,
      tradesGainedBreakdown,
      buysBreakdown,
      buysGainedBreakdown,
      cardsAcquiredGraded,
      cardsAcquiredUngraded,
      cardsTradedAwayGraded,
      cardsTradedAwayUngraded,
    };
  }, [transactions]);

  if (!user) {
    return (
      <div className="max-w-6xl mx-auto">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Please sign in to view transaction summary.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <PieChart className="h-8 w-8 text-green-600" />
        <div>
          <h1 className="text-3xl font-bold">Transaction Summary</h1>
          <p className="text-muted-foreground">Vendor Toolkit</p>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Loading summary...</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-lg">
                  <DollarSign className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Cash Sales</div>
                  <div className="text-2xl font-bold">{summary.totalSales}</div>
                  <div className="text-xs text-muted-foreground">{formatCurrency(summary.totalSaleValue + summary.cashFromTrades)}</div>
                  {(summary.salesBreakdown.gradedValue > 0 || summary.salesBreakdown.ungradedValue > 0 || summary.cashFromTrades > 0) && (
                    <div className="text-xs text-muted-foreground mt-1 border-t pt-1">
                      {summary.cashFromTrades > 0 && (
                        <div className="text-purple-600 font-medium">💵 Cash from Trades: {formatCurrency(summary.cashFromTrades)}</div>
                      )}
                      {summary.salesBreakdown.gradedValue > 0 && (
                        <div className="text-yellow-600 font-medium">⭐ Graded: {formatCurrency(summary.salesBreakdown.gradedValue)}</div>
                      )}
                      {summary.salesBreakdown.ungradedValue > 0 && (
                        <div>Ungraded: {formatCurrency(summary.salesBreakdown.ungradedValue)}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <TrendingUp className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Value Gained</div>
                  <div className={`text-2xl font-bold ${summary.totalValueGained >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(summary.totalValueGained)}
                  </div>
                  <div className="text-xs text-muted-foreground">From trades + buys</div>
                  {(summary.tradesGainedBreakdown.gradedValue > 0 || summary.tradesGainedBreakdown.ungradedValue > 0 || summary.buysGainedBreakdown.gradedValue > 0 || summary.buysGainedBreakdown.ungradedValue > 0) && (
                    <div className="text-xs text-muted-foreground mt-1 border-t pt-1">
                      <div className="text-yellow-600 font-medium">⭐ Graded: {formatCurrency(summary.tradesGainedBreakdown.gradedValue + summary.buysGainedBreakdown.gradedValue)}</div>
                      <div>Ungraded: {formatCurrency(summary.tradesGainedBreakdown.ungradedValue + summary.buysGainedBreakdown.ungradedValue)}</div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Repeat className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Total Trades</div>
                  <div className="text-2xl font-bold">{summary.totalTrades}</div>
                  <div className="text-xs text-muted-foreground">{formatCurrency(summary.totalTradeValue)} cost</div>
                  <div className={`text-xs font-semibold ${summary.tradeValueGained >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(summary.tradeValueGained)} gained
                  </div>
                  {(summary.tradesBreakdown.gradedValue > 0 || summary.tradesBreakdown.ungradedValue > 0) && (
                    <div className="text-xs text-muted-foreground mt-1 border-t pt-1">
                      <div className="text-yellow-600 font-medium">⭐ Graded: {formatCurrency(summary.tradesGainedBreakdown.gradedValue)} gained</div>
                      <div>Ungraded: {formatCurrency(summary.tradesGainedBreakdown.ungradedValue)} gained</div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-100 rounded-lg">
                  <ShoppingCart className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Total Purchases</div>
                  <div className="text-2xl font-bold">{summary.totalBuys}</div>
                  <div className="text-xs text-muted-foreground">{formatCurrency(summary.totalBuyValue)} cost</div>
                  <div className={`text-xs font-semibold ${summary.buyValueGained >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(summary.buyValueGained)} gained
                  </div>
                  {(summary.buysBreakdown.gradedValue > 0 || summary.buysBreakdown.ungradedValue > 0) && (
                    <div className="text-xs text-muted-foreground mt-1 border-t pt-1">
                      <div className="text-yellow-600 font-medium">⭐ Graded: {formatCurrency(summary.buysGainedBreakdown.gradedValue)} gained</div>
                      <div>Ungraded: {formatCurrency(summary.buysGainedBreakdown.ungradedValue)} gained</div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-orange-100 rounded-lg">
                  <PieChart className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Cards</div>
                  <div className="text-2xl font-bold">{summary.cardsAcquired}</div>
                  <div className="text-xs text-muted-foreground">{summary.cardsTradedAway} traded away</div>
                  {(summary.cardsAcquiredGraded > 0 || summary.cardsAcquiredUngraded > 0 || summary.cardsTradedAwayGraded > 0 || summary.cardsTradedAwayUngraded > 0) && (
                    <div className="text-xs text-muted-foreground mt-1 border-t pt-1">
                      {summary.cardsAcquired > 0 && (
                        <div className="mb-1">
                          <div className="font-medium">Acquired:</div>
                          <div className="text-yellow-600">⭐ {summary.cardsAcquiredGraded} graded</div>
                          <div>{summary.cardsAcquiredUngraded} ungraded</div>
                        </div>
                      )}
                      {summary.cardsTradedAway > 0 && (
                        <div>
                          <div className="font-medium">Traded Away:</div>
                          <div className="text-yellow-600">⭐ {summary.cardsTradedAwayGraded} graded</div>
                          <div>{summary.cardsTradedAwayUngraded} ungraded</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {transactions.length === 0 && (
            <Card className="md:col-span-2 lg:col-span-4">
              <CardContent className="p-6 text-center">
                <PieChart className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No transaction data yet.</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Complete trades or purchases to see analytics here.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

