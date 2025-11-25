import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Package, DollarSign, Target, Layers, Star, PieChart, Award, Trophy } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { formatCurrency, computeTcgPrice, getCardmarketAvg, getCardmarketLowest, convertCurrency } from "@/utils/cardHelpers";

/**
 * Inventory Insights Page (Vendor Toolkit)
 * Shows analytics and statistics about vendor inventory
 */

export function InventoryInsights() {
  const { collectionItems, currency, roundUpPrices, marketSource, userProfile } = useApp();

  // Helper function to get card value based on market source
  const getCardValue = (item) => {
    // If manual price is set, use it
    if (item.manualPrice !== undefined && item.manualPrice !== null && item.manualPrice !== "") {
      return parseFloat(item.manualPrice) || 0;
    }
    
    if (!item.prices) return 0;
    
    const condition = item.condition || "NM";
    
    if (marketSource === "cardmarket") {
      // CardMarket: For non-NM cards, check manual price
      if (condition !== "NM") {
        return 0; // Requires manual input
      }
      // CardMarket NM: use 30d average
      return getCardmarketAvg(item) || getCardmarketLowest(item) || 0;
    } else {
      // TCGplayer: use market price adjusted for condition
      return computeTcgPrice(item, condition) || 0;
    }
  };

  // Calculate inventory statistics
  const stats = useMemo(() => {
    if (!collectionItems || collectionItems.length === 0) return null;

    const totalCards = collectionItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const uniqueCards = collectionItems.length;
    
    // Calculate total value at different price points
    const totalMarketValue = collectionItems.reduce((sum, item) => {
      const value = getCardValue(item);
      const quantity = item.quantity || 1;
      return sum + (value * quantity);
    }, 0);

    // Calculate trade value (typically 90% of market)
    const tradePct = userProfile?.defaultTradePct || 90;
    const totalTradeValue = totalMarketValue * (tradePct / 100);

    // Calculate buy value (typically 70% of market)
    const buyPct = userProfile?.defaultBuyPct || 70;
    const totalBuyValue = totalMarketValue * (buyPct / 100);

    // Potential profit (sell at market, bought at buy price)
    const potentialProfit = totalMarketValue - totalBuyValue;
    const profitMargin = totalMarketValue > 0 ? ((potentialProfit / totalMarketValue) * 100) : 0;

    // Rarity breakdown
    const rarityCount = collectionItems.reduce((acc, item) => {
      const rarity = item.rarity || "Unknown";
      acc[rarity] = (acc[rarity] || 0) + (item.quantity || 1);
      return acc;
    }, {});

    // Set distribution
    const setCount = collectionItems.reduce((acc, item) => {
      const set = item.set || "Unknown";
      acc[set] = (acc[set] || 0) + (item.quantity || 1);
      return acc;
    }, {});

    // Top 5 most valuable cards
    const topCards = [...collectionItems]
      .map(item => {
        const marketValue = getCardValue(item);
        const quantity = item.quantity || 1;
        return {
          ...item,
          marketValue: marketValue * quantity,
          tradeValue: (marketValue * (tradePct / 100)) * quantity,
          buyValue: (marketValue * (buyPct / 100)) * quantity,
        };
      })
      .sort((a, b) => b.marketValue - a.marketValue)
      .slice(0, 5);

    // Condition breakdown
    const conditionCount = collectionItems.reduce((acc, item) => {
      const condition = item.condition || "NM";
      const conditionLabels = {
        NM: "Near Mint",
        LP: "Lightly Played",
        MP: "Moderately Played",
        HP: "Heavily Played",
        DMG: "Damaged"
      };
      const label = conditionLabels[condition] || condition;
      acc[label] = (acc[label] || 0) + (item.quantity || 1);
      return acc;
    }, {});

    // High value cards (over $50)
    const highValueCount = collectionItems.filter(item => getCardValue(item) >= 50).length;

    // Average card value
    const avgValue = totalCards > 0 ? totalMarketValue / totalCards : 0;

    // Graded card statistics
    const gradedCards = collectionItems.filter(item => item.isGraded);
    const gradedCardCount = gradedCards.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const ungradedCardCount = totalCards - gradedCardCount;
    
    // Grading company breakdown
    const gradingCompanyCount = gradedCards.reduce((acc, item) => {
      const company = item.gradingCompany || "Unknown";
      acc[company] = (acc[company] || 0) + (item.quantity || 1);
      return acc;
    }, {});
    
    // Average grade (numeric grades only)
    const numericGrades = gradedCards
      .filter(item => !isNaN(parseFloat(item.grade)))
      .map(item => parseFloat(item.grade));
    const avgGrade = numericGrades.length > 0 
      ? numericGrades.reduce((sum, grade) => sum + grade, 0) / numericGrades.length 
      : 0;
    
    // Graded card value (convert from USD to user's currency)
    const gradedCardValue = gradedCards.reduce((sum, item) => {
      const valueUSD = item.calculatedSuggestedPrice || item.gradedPrice || 0;
      const valueLocal = convertCurrency(valueUSD, currency, 'USD');
      const quantity = item.quantity || 1;
      return sum + (valueLocal * quantity);
    }, 0);
    
    // Top 5 most valuable graded cards
    const topGradedCards = [...gradedCards]
      .map(item => {
        const valueUSD = item.calculatedSuggestedPrice || item.gradedPrice || 0;
        const valueLocal = convertCurrency(valueUSD, currency, 'USD');
        const quantity = item.quantity || 1;
        return {
          ...item,
          totalValue: valueLocal * quantity,
        };
      })
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 5);

    return {
      totalCards,
      uniqueCards,
      totalMarketValue,
      totalTradeValue,
      totalBuyValue,
      potentialProfit,
      profitMargin,
      avgValue,
      rarityCount,
      setCount,
      topCards,
      conditionCount,
      highValueCount,
      tradePct,
      buyPct,
      gradedCardCount,
      ungradedCardCount,
      gradingCompanyCount,
      avgGrade,
      gradedCardValue,
      topGradedCards,
    };
  }, [collectionItems, marketSource, userProfile]);

  const formatPrice = (value) => {
    const formatted = roundUpPrices ? Math.ceil(value) : value;
    return formatCurrency(formatted, currency);
  };

  if (!collectionItems || collectionItems.length === 0) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <PieChart className="h-8 w-8 text-green-600" />
          <div>
            <h1 className="text-3xl font-bold">Inventory Insights</h1>
            <p className="text-muted-foreground">Vendor Toolkit</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">
              No cards in your inventory yet. Start adding cards to see insights!
            </p>
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
          <h1 className="text-3xl font-bold">Inventory Insights</h1>
          <p className="text-muted-foreground">Vendor Toolkit</p>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Inventory</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCards}</div>
            <p className="text-xs text-muted-foreground">{stats.uniqueCards} unique</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Market Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPrice(stats.totalMarketValue)}</div>
            <p className="text-xs text-muted-foreground">Retail price</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Trade Value</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPrice(stats.totalTradeValue)}</div>
            <p className="text-xs text-muted-foreground">@ {stats.tradePct}% of market</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Potential Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPrice(stats.potentialProfit)}</div>
            <p className="text-xs text-muted-foreground">{stats.profitMargin.toFixed(1)}% margin</p>
          </CardContent>
        </Card>
      </div>

      {/* Value Breakdown */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Value Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950">
              <div className="text-sm text-muted-foreground mb-1">Market Value</div>
              <div className="text-2xl font-bold">{formatPrice(stats.totalMarketValue)}</div>
            </div>
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950">
              <div className="text-sm text-muted-foreground mb-1">Trade Value</div>
              <div className="text-2xl font-bold">{formatPrice(stats.totalTradeValue)}</div>
            </div>
            <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-950">
              <div className="text-sm text-muted-foreground mb-1">Buy Value</div>
              <div className="text-2xl font-bold">{formatPrice(stats.totalBuyValue)}</div>
            </div>
            <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-950">
              <div className="text-sm text-muted-foreground mb-1">Profit Potential</div>
              <div className="text-2xl font-bold">{formatPrice(stats.potentialProfit)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Metrics */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Card Value</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPrice(stats.avgValue)}</div>
            <p className="text-xs text-muted-foreground">Per card</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">High Value Cards</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.highValueCount}</div>
            <p className="text-xs text-muted-foreground">Over $50</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Profit Margin</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.profitMargin.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Sell vs Buy</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Valuable Cards */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            Top 5 Most Valuable Cards
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {stats.topCards.map((card, idx) => (
              <div key={`${card.id}-${idx}`} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  {card.image && (
                    <img src={card.image} alt={card.name} className="h-16 w-auto rounded" />
                  )}
                  <div>
                    <div className="font-medium">{card.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {card.set} • {card.rarity} • Qty: {card.quantity || 1}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm">Market: {formatPrice(card.marketValue)}</div>
                  <div className="text-sm text-green-600">Trade: {formatPrice(card.tradeValue)}</div>
                  <div className="text-sm text-orange-600">Buy: {formatPrice(card.buyValue)}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Rarity & Condition Breakdown */}
      <div className="grid gap-6 md:grid-cols-2 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Rarity Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(stats.rarityCount)
                .sort((a, b) => b[1] - a[1])
                .map(([rarity, count]) => (
                  <div key={rarity} className="flex items-center justify-between p-2 rounded bg-muted/30">
                    <span className="font-medium">{rarity}</span>
                    <span className="text-muted-foreground">{count} cards</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Condition Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(stats.conditionCount)
                .sort((a, b) => b[1] - a[1])
                .map(([condition, count]) => (
                  <div key={condition} className="flex items-center justify-between p-2 rounded bg-muted/30">
                    <span className="font-medium">{condition}</span>
                    <span className="text-muted-foreground">{count} cards</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Graded Card Insights */}
      {stats.gradedCardCount > 0 && (
        <>
          <Card className="mb-6 bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-600" />
                Graded Card Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <div className="text-sm text-muted-foreground">Total Graded</div>
                  <div className="text-2xl font-bold text-yellow-700">{stats.gradedCardCount}</div>
                  <div className="text-xs text-muted-foreground">
                    {stats.totalCards > 0 ? ((stats.gradedCardCount / stats.totalCards) * 100).toFixed(1) : 0}% of inventory
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="text-sm text-muted-foreground">Graded Value</div>
                  <div className="text-2xl font-bold text-yellow-700">{formatPrice(stats.gradedCardValue)}</div>
                  <div className="text-xs text-muted-foreground">
                    {stats.totalMarketValue > 0 ? ((stats.gradedCardValue / stats.totalMarketValue) * 100).toFixed(1) : 0}% of total
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="text-sm text-muted-foreground">Average Grade</div>
                  <div className="text-2xl font-bold text-yellow-700">
                    {stats.avgGrade > 0 ? stats.avgGrade.toFixed(1) : "N/A"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {stats.ungradedCardCount} ungraded cards
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Grading Company Breakdown & Top Graded Cards */}
          <div className="grid gap-6 md:grid-cols-2 mb-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-yellow-600" />
                  Grading Companies
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(stats.gradingCompanyCount)
                    .sort((a, b) => b[1] - a[1])
                    .map(([company, count]) => {
                      const percentage = stats.gradedCardCount > 0 ? ((count / stats.gradedCardCount) * 100).toFixed(1) : 0;
                      return (
                        <div key={company} className="flex items-center justify-between p-2 rounded bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200">
                          <span className="font-medium">{company}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{percentage}%</span>
                            <span className="text-muted-foreground font-semibold">{count} cards</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-600" />
                  Top Graded Cards
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.topGradedCards.length > 0 ? (
                    stats.topGradedCards.map((card, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{card.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {card.gradingCompany} {card.grade}
                            {card.quantity > 1 && ` • Qty: ${card.quantity}`}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-sm text-yellow-700">{formatPrice(card.totalValue)}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-muted-foreground text-center py-4">
                      No graded cards in inventory
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Set Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Set Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(stats.setCount)
              .sort((a, b) => b[1] - a[1])
              .map(([set, count]) => (
                <div key={set} className="flex items-center justify-between p-2 rounded bg-muted/30">
                  <span className="font-medium text-sm">{set}</span>
                  <span className="text-muted-foreground text-sm">{count}</span>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
