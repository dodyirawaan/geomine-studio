// Model catalogue: classical models run in scikit-learn (Pyodide), deep models in TensorFlow.js.
import type { Task } from './types'

export interface ModelDef {
  id: string
  name: string
  engine: 'sklearn' | 'tfjs'
  family: 'Baseline' | 'Linear' | 'Instance-based' | 'Kernel' | 'Tree ensemble' | 'Boosting' | 'Neural network' | 'Deep learning'
  /** Only for sequence experiments (inputs shaped [window, channels]). */
  sequenceOnly?: boolean
  description: string
  /** Python package needed besides scikit-learn. */
  pyPackage?: string
}

export const MODELS: ModelDef[] = [
  { id: 'dummy', name: 'Baseline (majority / mean)', engine: 'sklearn', family: 'Baseline', description: 'Predicts the most frequent class or the mean. Every model must beat it.' },
  { id: 'linear', name: 'Logistic / Ridge regression', engine: 'sklearn', family: 'Linear', description: 'Regularised linear model; interpretable reference.' },
  { id: 'knn', name: 'k-nearest neighbours', engine: 'sklearn', family: 'Instance-based', description: 'Distance-based; sensitive to scaling and irrelevant features.' },
  { id: 'svm', name: 'Support vector machine (RBF)', engine: 'sklearn', family: 'Kernel', description: 'Strong on small, well-scaled datasets.' },
  { id: 'rf', name: 'Random forest', engine: 'sklearn', family: 'Tree ensemble', description: 'Robust default for tabular geotechnical data.' },
  { id: 'et', name: 'Extra trees', engine: 'sklearn', family: 'Tree ensemble', description: 'More randomised forest; lower variance.' },
  { id: 'hgb', name: 'Histogram gradient boosting', engine: 'sklearn', family: 'Boosting', description: "scikit-learn's LightGBM-style booster; handles missing values." },
  { id: 'xgb', name: 'XGBoost', engine: 'sklearn', family: 'Boosting', pyPackage: 'xgboost', description: 'Gradient-boosted trees with TreeSHAP explanations.' },
  { id: 'lgbm', name: 'LightGBM', engine: 'sklearn', family: 'Boosting', pyPackage: 'lightgbm', description: 'Fast leaf-wise boosting with TreeSHAP explanations.' },
  { id: 'mlp_sk', name: 'MLP (scikit-learn)', engine: 'sklearn', family: 'Neural network', description: 'Shallow feed-forward network with early stopping.' },
  { id: 'dnn', name: 'Deep neural network (DNN)', engine: 'tfjs', family: 'Deep learning', description: 'Fully connected deep network with dropout and early stopping.' },
  { id: 'cnn1d', name: '1D convolutional network', engine: 'tfjs', family: 'Deep learning', sequenceOnly: true, description: 'Learns local temporal patterns in IR/AE/microseismic sequences.' },
  { id: 'lstm', name: 'LSTM', engine: 'tfjs', family: 'Deep learning', sequenceOnly: true, description: 'Long short-term memory network for time-dependent behaviour.' },
  { id: 'gru', name: 'GRU', engine: 'tfjs', family: 'Deep learning', sequenceOnly: true, description: 'Gated recurrent unit; lighter alternative to LSTM.' },
]

export function modelName(id: string, task: Task): string {
  if (id === 'linear') return task === 'classification' ? 'Logistic regression' : 'Ridge regression'
  if (id === 'dummy') return task === 'classification' ? 'Baseline (majority class)' : 'Baseline (mean)'
  return MODELS.find((m) => m.id === id)?.name ?? id
}
