import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from datetime import datetime
import pandas as pd

# Data from the analysis
data = {
    'date': [
        '2025-11-01', '2025-11-02', '2025-11-03', '2025-11-04', '2025-11-05',
        '2025-11-06', '2025-11-07', '2025-11-08', '2025-11-09', '2025-11-10',
        '2025-11-11', '2025-11-12', '2025-11-13', '2025-11-14', '2025-11-15',
        '2025-11-16', '2025-11-17', '2025-11-18', '2025-11-19', '2025-11-20',
        '2025-11-21', '2025-11-22', '2025-11-23', '2025-11-24', '2025-11-25',
        '2025-11-26', '2025-11-27', '2025-11-28', '2025-11-29', '2025-11-30',
        '2025-12-01', '2025-12-02', '2025-12-03', '2025-12-04', '2025-12-05',
        '2025-12-06', '2025-12-07'
    ],
    'store_pct': [
        14.5, 14.7, 14.4, 13.7, 15.5, 24.7, 21.6, 21.5, 19.1, 19.8,
        20.2, 19.1, 19.4, 19.1, 17.4, 16.4, 17.8, 17.6, 19.7, 36.3,
        34.8, 28.8, 26.8, 26.9, 26.4, 29.8, 29.2, 60.7, 53.2, 48.6,
        52.6, 41.9, 30.1, 32.0, 28.2, 26.2, 25.6
    ],
    'apple_google_pct': [
        85.5, 85.3, 85.6, 86.3, 84.5, 75.3, 78.4, 78.5, 80.9, 80.2,
        79.8, 80.9, 80.6, 80.9, 82.6, 83.6, 82.2, 82.4, 80.3, 63.7,
        65.2, 71.2, 73.2, 73.1, 73.6, 70.2, 70.8, 39.3, 46.8, 51.4,
        47.4, 58.1, 69.9, 68.0, 71.8, 73.8, 74.4
    ],
    'total_revenue_K': [
        1263, 1050, 955, 835, 886, 5649, 2384, 2072, 1505, 1157,
        1160, 898, 851, 938, 1040, 886, 711, 645, 722, 2631,
        1722, 1396, 1114, 872, 823, 854, 855, 3315, 2637, 1930,
        1604, 951, 794, 4346, 1897, 1586, 1161
    ]
}

df = pd.DataFrame(data)
df['date'] = pd.to_datetime(df['date'])

# Create figure with dark theme
plt.style.use('dark_background')
fig, ax1 = plt.subplots(figsize=(16, 8))

# Set background colors
fig.patch.set_facecolor('#1a1a2e')
ax1.set_facecolor('#1a1a2e')

# Plot Store % as main line
color_store = '#00d4aa'  # Teal/cyan for Store
color_apple = '#ff6b6b'  # Coral for Apple/Google
color_revenue = '#ffd93d'  # Yellow for revenue bars

# Plot the percentages
line1, = ax1.plot(df['date'], df['store_pct'], color=color_store, linewidth=2.5, 
                   marker='o', markersize=4, label='Supercell Store %')
line2, = ax1.plot(df['date'], df['apple_google_pct'], color=color_apple, linewidth=2.5, 
                   marker='o', markersize=4, label='Apple/Google %', alpha=0.7)

# Add horizontal reference lines
ax1.axhline(y=50, color='white', linestyle='--', alpha=0.3, linewidth=1)
ax1.axhline(y=18, color=color_store, linestyle=':', alpha=0.4, linewidth=1, label='Pre-BF Baseline (~18%)')

# Highlight Black Friday
bf_date = datetime(2025, 11, 28)
ax1.axvline(x=bf_date, color='#ffd93d', linestyle='--', alpha=0.8, linewidth=2)
ax1.annotate('Black Friday\n60.7%', xy=(bf_date, 60.7), xytext=(bf_date, 72),
             fontsize=10, color='#ffd93d', ha='center', fontweight='bold',
             arrowprops=dict(arrowstyle='->', color='#ffd93d', alpha=0.7))

# Highlight Dec 1 peak
dec1_date = datetime(2025, 12, 1)
ax1.annotate('Dec 1\n52.6%', xy=(dec1_date, 52.6), xytext=(dec1_date, 65),
             fontsize=9, color=color_store, ha='center',
             arrowprops=dict(arrowstyle='->', color=color_store, alpha=0.7))

# Highlight Nov 20 start of shift
nov20_date = datetime(2025, 11, 20)
ax1.annotate('Shift Begins\n36.3%', xy=(nov20_date, 36.3), xytext=(nov20_date, 48),
             fontsize=9, color=color_store, ha='center',
             arrowprops=dict(arrowstyle='->', color=color_store, alpha=0.7))

# Formatting
ax1.set_xlabel('Date', fontsize=12, color='white')
ax1.set_ylabel('% of Daily Revenue', fontsize=12, color='white')
ax1.set_ylim(0, 100)
ax1.set_xlim(df['date'].min(), df['date'].max())

# Format x-axis dates
ax1.xaxis.set_major_formatter(mdates.DateFormatter('%b %d'))
ax1.xaxis.set_major_locator(mdates.DayLocator(interval=3))
plt.xticks(rotation=45, ha='right')

# Grid
ax1.grid(True, alpha=0.2, linestyle='-', linewidth=0.5)

# Title
plt.title('Brawl Stars: Store % of Revenue - Before & After Black Friday 2025', 
          fontsize=16, fontweight='bold', color='white', pad=20)

# Legend
ax1.legend(loc='upper left', fontsize=10, framealpha=0.3)

# Add summary text box
summary_text = (
    'Pre-BF Baseline: ~18%\n'
    'Black Friday Peak: 60.7%\n'
    'Post-BF Average: ~35%\n'
    'Current: ~26%'
)
props = dict(boxstyle='round', facecolor='#2d2d44', alpha=0.8, edgecolor=color_store)
ax1.text(0.98, 0.97, summary_text, transform=ax1.transAxes, fontsize=10,
         verticalalignment='top', horizontalalignment='right', bbox=props, color='white')

plt.tight_layout()

# Save the figure
plt.savefig('/Users/rafael.rimola/Documents/Poke Master App CURSOR Copy/brawl_store_revenue_chart.png', 
            dpi=150, facecolor='#1a1a2e', edgecolor='none', bbox_inches='tight')
print("Chart saved to: brawl_store_revenue_chart.png")

# Also show it
plt.show()






