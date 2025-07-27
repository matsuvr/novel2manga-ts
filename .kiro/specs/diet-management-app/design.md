# 技術設計書

## システム概要

### アーキテクチャ
- **アーキテクチャパターン**: Model-View-ViewModel (MVVM) + Repository Pattern
- **プラットフォーム**: モバイルアプリ（iOS/Android対応）
- **開発手法**: Cross-platform開発（React Native/Flutter推奨）

### システム構成図
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Presentation  │    │    Business     │    │      Data       │
│     Layer       │◄──►│     Layer       │◄──►│     Layer       │
│                 │    │                 │    │                 │
│ - Views         │    │ - ViewModels    │    │ - Repositories  │
│ - Components    │    │ - Services      │    │ - Data Sources  │
│ - Navigation    │    │ - Validators    │    │ - Models        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 技術スタック

### フロントエンド
- **フレームワーク**: React Native 0.72+
- **状態管理**: Redux Toolkit + RTK Query
- **ナビゲーション**: React Navigation 6
- **UI コンポーネント**: React Native Elements + Native Base
- **グラフ表示**: React Native Chart Kit
- **アニメーション**: React Native Reanimated 3

### バックエンド・データストレージ
- **ローカルDB**: SQLite (react-native-sqlite-storage)
- **キャッシュ**: React Native MMKV
- **バックアップ**: iCloud/Google Drive API
- **食材データベース**: JSON形式のローカルデータ + カスタム追加機能

### DevOps・ツール
- **状態管理デバッグ**: Flipper + Redux DevTools
- **テスト**: Jest + React Native Testing Library
- **コード品質**: ESLint + Prettier + TypeScript
- **ビルドツール**: Metro + React Native CLI

## データモデル設計

### ER図
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│    User     │    │  WeightLog  │    │  FoodEntry  │
├─────────────┤    ├─────────────┤    ├─────────────┤
│ id (PK)     │───►│ id (PK)     │    │ id (PK)     │
│ age         │    │ user_id(FK) │    │ user_id(FK) │◄──┐
│ gender      │    │ weight      │    │ food_id(FK) │   │
│ height      │    │ date        │    │ meal_type   │   │
│ goal_weight │    │ created_at  │    │ quantity    │   │
│ target_date │    └─────────────┘    │ calories    │   │
│ daily_cal   │                       │ date        │   │
│ created_at  │    ┌─────────────┐    │ created_at  │   │
└─────────────┘    │  FoodItem   │    └─────────────┘   │
                   ├─────────────┤                      │
                   │ id (PK)     │─────────────────────┘
                   │ name        │
                   │ cal_per_100g│
                   │ category    │
                   │ is_custom   │
                   └─────────────┘

┌─────────────┐    ┌─────────────┐
│    Goal     │    │Notification │
├─────────────┤    ├─────────────┤
│ id (PK)     │    │ id (PK)     │
│ user_id(FK) │    │ user_id(FK) │
│ goal_type   │    │ type        │
│ target_val  │    │ time        │
│ current_val │    │ is_enabled  │
│ deadline    │    │ message     │
│ is_active   │    └─────────────┘
└─────────────┘
```

### データテーブル仕様

#### users テーブル
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  age INTEGER NOT NULL,
  gender TEXT CHECK(gender IN ('male', 'female', 'other')) NOT NULL,
  height REAL NOT NULL CHECK(height > 0),
  current_weight REAL NOT NULL CHECK(current_weight > 0),
  goal_weight REAL NOT NULL CHECK(goal_weight > 0),
  target_date DATE,
  daily_calorie_goal INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### weight_logs テーブル
```sql
CREATE TABLE weight_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  weight REAL NOT NULL CHECK(weight > 0),
  date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, date)
);
```

#### food_items テーブル
```sql
CREATE TABLE food_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  calories_per_100g INTEGER NOT NULL CHECK(calories_per_100g >= 0),
  category TEXT DEFAULT 'other',
  is_custom BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### food_entries テーブル
```sql
CREATE TABLE food_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  food_id INTEGER NOT NULL,
  meal_type TEXT CHECK(meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')) NOT NULL,
  quantity REAL NOT NULL CHECK(quantity > 0),
  calories INTEGER NOT NULL CHECK(calories >= 0),
  date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (food_id) REFERENCES food_items(id)
);
```

## アプリケーション設計

### レイヤー構成

#### 1. Presentation Layer (UI層)
```typescript
// screens/
├── AuthScreen/
│   ├── LoginScreen.tsx
│   └── RegisterScreen.tsx
├── HomeScreen/
│   ├── DashboardScreen.tsx
│   └── QuickEntryModal.tsx
├── FoodScreen/
│   ├── FoodLogScreen.tsx
│   ├── FoodSearchScreen.tsx
│   └── FoodDetailScreen.tsx
├── WeightScreen/
│   ├── WeightLogScreen.tsx
│   └── WeightChartScreen.tsx
├── ReportScreen/
│   ├── WeeklyReportScreen.tsx
│   └── MonthlyReportScreen.tsx
└── SettingsScreen/
    ├── ProfileScreen.tsx
    ├── GoalScreen.tsx
    └── NotificationScreen.tsx

// components/
├── common/
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Chart.tsx
│   └── Loading.tsx
├── forms/
│   ├── FoodEntryForm.tsx
│   ├── WeightEntryForm.tsx
│   └── ProfileForm.tsx
└── charts/
    ├── WeightChart.tsx
    ├── CalorieChart.tsx
    └── ProgressChart.tsx
```

#### 2. Business Layer (ビジネスロジック層)
```typescript
// services/
├── AuthService.ts
├── UserService.ts
├── FoodService.ts
├── WeightService.ts
├── NotificationService.ts
└── ReportService.ts

// stores/ (Redux Toolkit)
├── userSlice.ts
├── foodSlice.ts
├── weightSlice.ts
├── reportSlice.ts
└── store.ts

// hooks/
├── useAuth.ts
├── useFood.ts
├── useWeight.ts
└── useNotification.ts
```

#### 3. Data Layer (データ層)
```typescript
// repositories/
├── UserRepository.ts
├── FoodRepository.ts
├── WeightRepository.ts
└── NotificationRepository.ts

// datasources/
├── local/
│   ├── SQLiteDataSource.ts
│   ├── StorageDataSource.ts
│   └── CacheDataSource.ts
└── remote/
    └── BackupDataSource.ts

// models/
├── User.ts
├── Food.ts
├── Weight.ts
└── Notification.ts
```

### 主要機能の技術実装

#### 1. カロリー計算エンジン
```typescript
class CalorieCalculator {
  static calculateBMR(user: User): number {
    // Mifflin-St Jeor式
    const { age, gender, height, currentWeight } = user;
    const base = 10 * currentWeight + 6.25 * height - 5 * age;
    return gender === 'male' ? base + 5 : base - 161;
  }

  static calculateDailyCalorieGoal(user: User): number {
    const bmr = this.calculateBMR(user);
    const activityMultiplier = 1.4; // 軽い活動レベル
    const weightLossRate = 0.5; // 週0.5kg減量
    const weeklyDeficit = weightLossRate * 7700; // 1kg = 7700kcal
    const dailyDeficit = weeklyDeficit / 7;
    
    return Math.round(bmr * activityMultiplier - dailyDeficit);
  }
}
```

#### 2. 体重進捗トラッキング
```typescript
class ProgressTracker {
  static calculateProgress(weightLogs: WeightLog[], goal: Goal): ProgressData {
    const startWeight = weightLogs[0]?.weight || goal.startWeight;
    const currentWeight = weightLogs[weightLogs.length - 1]?.weight || startWeight;
    const targetWeight = goal.targetWeight;
    
    const totalLoss = startWeight - targetWeight;
    const currentLoss = startWeight - currentWeight;
    const progressPercentage = (currentLoss / totalLoss) * 100;
    
    return {
      progressPercentage: Math.max(0, Math.min(100, progressPercentage)),
      remainingWeight: Math.max(0, currentWeight - targetWeight),
      averageWeeklyLoss: this.calculateAverageWeeklyLoss(weightLogs),
      estimatedCompletion: this.estimateCompletionDate(weightLogs, targetWeight)
    };
  }
}
```

#### 3. データ可視化
```typescript
// Chart Configuration
const chartConfig = {
  backgroundColor: '#ffffff',
  backgroundGradientFrom: '#ffffff',
  backgroundGradientTo: '#ffffff',
  color: (opacity = 1) => `rgba(81, 150, 244, ${opacity})`,
  strokeWidth: 2,
  barPercentage: 0.7,
  useShadowColorFromDataset: false,
  decimalPlaces: 1
};

// Weight Chart Component
const WeightChart: React.FC<WeightChartProps> = ({ data, period }) => {
  const chartData = useMemo(() => ({
    labels: data.map(item => format(new Date(item.date), 'MM/dd')),
    datasets: [{
      data: data.map(item => item.weight),
      color: (opacity = 1) => `rgba(81, 150, 244, ${opacity})`,
      strokeWidth: 2
    }]
  }), [data]);

  return (
    <LineChart
      data={chartData}
      width={screenWidth - 32}
      height={220}
      chartConfig={chartConfig}
      bezier
      style={styles.chart}
    />
  );
};
```

## セキュリティ・プライバシー設計

### データ暗号化
```typescript
// Encryption Service
class EncryptionService {
  private static readonly ENCRYPTION_KEY = 'user-specific-key';
  
  static async encryptSensitiveData(data: string): Promise<string> {
    // AES-256暗号化
    return CryptoJS.AES.encrypt(data, this.ENCRYPTION_KEY).toString();
  }
  
  static async decryptSensitiveData(encryptedData: string): Promise<string> {
    const bytes = CryptoJS.AES.decrypt(encryptedData, this.ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  }
}

// Local Storage with Encryption
class SecureStorage {
  static async setItem(key: string, value: any): Promise<void> {
    const encrypted = await EncryptionService.encryptSensitiveData(JSON.stringify(value));
    return AsyncStorage.setItem(key, encrypted);
  }
  
  static async getItem(key: string): Promise<any> {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    
    const decrypted = await EncryptionService.decryptSensitiveData(encrypted);
    return JSON.parse(decrypted);
  }
}
```

### バックアップ・復元機能
```typescript
class BackupService {
  static async createBackup(): Promise<BackupData> {
    const userData = await UserRepository.getCurrentUser();
    const weightLogs = await WeightRepository.getAllLogs();
    const foodEntries = await FoodRepository.getAllEntries();
    
    return {
      version: '1.0',
      timestamp: new Date().toISOString(),
      data: {
        user: userData,
        weightLogs,
        foodEntries
      }
    };
  }
  
  static async restoreFromBackup(backupData: BackupData): Promise<void> {
    await DatabaseService.clearAllData();
    
    await UserRepository.create(backupData.data.user);
    await WeightRepository.bulkInsert(backupData.data.weightLogs);
    await FoodRepository.bulkInsert(backupData.data.foodEntries);
  }
}
```

## パフォーマンス最適化

### メモリ管理
```typescript
// Lazy Loading for Large Lists
const FoodSearchScreen: React.FC = () => {
  const [searchResults, setSearchResults] = useState<FoodItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const debouncedSearch = useMemo(
    () => debounce(async (query: string) => {
      setIsLoading(true);
      const results = await FoodService.searchFoods(query);
      setSearchResults(results.slice(0, 50)); // 最初の50件のみ表示
      setIsLoading(false);
    }, 300),
    []
  );
  
  return (
    <FlatList
      data={searchResults}
      renderItem={({ item }) => <FoodItem food={item} />}
      keyExtractor={(item) => item.id.toString()}
      removeClippedSubviews={true}
      maxToRenderPerBatch={10}
      windowSize={5}
    />
  );
};
```

### キャッシュ戦略
```typescript
class CacheManager {
  private static readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24時間
  
  static async getCachedData<T>(key: string): Promise<T | null> {
    const cached = await MMKV.getString(key);
    if (!cached) return null;
    
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > this.CACHE_DURATION) {
      await MMKV.delete(key);
      return null;
    }
    
    return data;
  }
  
  static async setCachedData<T>(key: string, data: T): Promise<void> {
    const cacheData = {
      data,
      timestamp: Date.now()
    };
    await MMKV.setString(key, JSON.stringify(cacheData));
  }
}
```

## エラーハンドリング・ログ戦略

### グローバルエラーハンドリング
```typescript
// Error Boundary
class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  
  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error: error.message
    };
  }
  
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    LogService.logError('AppErrorBoundary', error, errorInfo);
  }
  
  render() {
    if (this.state.hasError) {
      return <ErrorScreen error={this.state.error} onRetry={this.handleRetry} />;
    }
    
    return this.props.children;
  }
}

// Logging Service
class LogService {
  static logError(context: string, error: Error, extra?: any): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      context,
      message: error.message,
      stack: error.stack,
      extra
    };
    
    // 開発環境ではコンソール出力
    if (__DEV__) {
      console.error('App Error:', logEntry);
    }
    
    // プロダクションでは crash analytics に送信
    // CrashAnalytics.recordError(error);
  }
}
```

## 通知システム設計

### Push通知管理
```typescript
class NotificationManager {
  static async scheduleReminder(
    type: 'meal' | 'weight',
    time: string,
    message: string
  ): Promise<void> {
    const notificationId = `${type}_${time}`;
    
    await PushNotification.localNotificationSchedule({
      id: notificationId,
      title: 'ダイエット記録リマインダー',
      message,
      date: new Date(time),
      repeatType: 'day'
    });
  }
  
  static async cancelReminder(id: string): Promise<void> {
    await PushNotification.cancelLocalNotifications({ id });
  }
  
  static async scheduleMotivationalNotification(): Promise<void> {
    const user = await UserRepository.getCurrentUser();
    const progress = await ProgressTracker.calculateProgress(user);
    
    let message = '今日も記録を続けましょう！';
    
    if (progress.progressPercentage > 50) {
      message = `目標まで${progress.remainingWeight.toFixed(1)}kg！順調です🎉`;
    }
    
    await this.scheduleReminder('motivation', '20:00', message);
  }
}
```

## テスト戦略

### ユニットテスト
```typescript
// CalorieCalculator.test.ts
describe('CalorieCalculator', () => {
  test('男性のBMR計算が正確である', () => {
    const user: User = {
      age: 30,
      gender: 'male',
      height: 175,
      currentWeight: 70
    };
    
    const bmr = CalorieCalculator.calculateBMR(user);
    expect(bmr).toBe(1663); // 期待値
  });
  
  test('女性のBMR計算が正確である', () => {
    const user: User = {
      age: 25,
      gender: 'female',
      height: 160,
      currentWeight: 55
    };
    
    const bmr = CalorieCalculator.calculateBMR(user);
    expect(bmr).toBe(1309); // 期待値
  });
});
```

### インテグレーションテスト
```typescript
// FoodEntry.integration.test.ts
describe('Food Entry Integration', () => {
  test('食事記録の完全なフローが動作する', async () => {
    // 1. ユーザー作成
    const user = await UserRepository.create(mockUser);
    
    // 2. 食材検索
    const searchResults = await FoodService.searchFoods('りんご');
    expect(searchResults.length).toBeGreaterThan(0);
    
    // 3. 食事記録
    const entry = await FoodService.addFoodEntry({
      userId: user.id,
      foodId: searchResults[0].id,
      quantity: 150,
      mealType: 'breakfast'
    });
    
    // 4. カロリー合計確認
    const dailyCalories = await FoodService.getDailyCalories(user.id);
    expect(dailyCalories).toBe(entry.calories);
  });
});
```

## デプロイメント・運用

### ビルド設定
```javascript
// metro.config.js
module.exports = {
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
  resolver: {
    alias: {
      '@': './src',
      '@components': './src/components',
      '@screens': './src/screens',
      '@services': './src/services',
      '@utils': './src/utils'
    }
  }
};
```

### パフォーマンス監視
```typescript
// Performance Monitor
class PerformanceMonitor {
  static startTimer(operation: string): string {
    const timerId = `${operation}_${Date.now()}`;
    console.time(timerId);
    return timerId;
  }
  
  static endTimer(timerId: string): void {
    console.timeEnd(timerId);
  }
  
  static async measureAsyncOperation<T>(
    operation: string,
    asyncFn: () => Promise<T>
  ): Promise<T> {
    const timerId = this.startTimer(operation);
    try {
      const result = await asyncFn();
      return result;
    } finally {
      this.endTimer(timerId);
    }
  }
}
```

この技術設計書では、要件で定義された8つの主要機能を効率的に実装するための包括的な技術アーキテクチャを提供しています。React Nativeベースのクロスプラットフォーム開発により、iOS/Android両方に対応しつつ、SQLiteによるローカルデータ管理とMMKVキャッシュによる高速化を実現します。