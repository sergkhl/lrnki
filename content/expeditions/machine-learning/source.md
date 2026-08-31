# Machine Learning: Applied Supervised Learning

Supervised machine learning constructs a function from labeled examples. Each example contains predictors, often written as a vector `x`, and a target `y`. Training uses observed pairs `(x, y)` to select a function that predicts the target for new cases drawn from an intended operating environment.

This path focuses on applied supervised learning: regression for numerical targets and classification for categorical targets. It does not attempt to survey unsupervised learning, reinforcement learning, generative modeling, or the full theory of statistical learning. Its main concern is the complete decision system around a predictive model: framing the target, constructing evaluation data, preventing leakage, fitting and selecting models, choosing metrics and thresholds, and detecting when deployment conditions invalidate prior evidence.

The fitted model is only one component. A useful supervised-learning system also includes a data contract, preprocessing, a prediction-time interface, a decision rule, and monitoring. Many expensive failures occur outside the optimization algorithm: the target may encode the wrong outcome, the test split may leak future information, training features may not exist at prediction time, or a well-ranked score may be converted into harmful decisions with an unsuitable threshold.

## 1. Frame the Prediction Problem Around a Decision

A supervised-learning project begins with an operational question, not a model family. Define the **prediction unit**, **prediction time**, **target**, **prediction horizon**, **available features**, and **decision influenced by the output**. “Predict customer behavior” is underspecified. “At the end of each subscription month, estimate the probability that an active account will cancel during the following 30 days, using only information available by that cutoff, so a support team can prioritize a limited number of outreach offers” is much closer to an evaluable problem.

The prediction unit identifies one row at inference time: an account-month, a component-cycle, a patient-visit, or a document. The same real-world entity may appear in many rows. That repetition affects splitting and uncertainty because rows belonging to one entity share history.

The target must represent an observable outcome with a reliable time window. A **proxy target** is used when the desired outcome is unavailable. Predicting whether a support ticket is escalated might be easier to label than predicting whether the underlying problem is severe, but escalation also reflects staffing and policy. A model trained on the proxy can learn those processes instead of the intended property. Label definitions should specify ambiguous cases, delayed outcomes, censoring, and how corrections are handled.

The prediction horizon determines what counts as future. A failure within one hour and a failure within one year are different targets even when their labels come from the same log. A horizon should match the time needed to act. A highly accurate alert that arrives after intervention is possible has little decision value.

Features must be available at the exact moment a prediction would be made. This **availability contract** is stronger than asking whether a field exists somewhere in the historical database. A final invoice total may be known during offline training but not while an order is being reviewed. A human resolution code may be recorded on the same row as the initial request but assigned days later. Event timestamps, ingestion timestamps, correction behavior, and production latency all belong in the contract.

Choose the outcome measure in relation to the decision. An error of 10 units may be minor in one range and critical in another. A false negative can have a different cost from a false positive. Costs may also vary by case: missing a rare catastrophic fault is unlike missing a low-cost maintenance issue. When decisions consume a limited resource, evaluation should include the capacity constraint, such as performance among the highest-scored 500 cases each day.

The desired output might be a point estimate, probability, interval, ranking, or discrete action. These are not interchangeable. A ranking can prioritize review without producing calibrated probabilities. A probability supports thresholding under changing costs if it is calibrated for the operating population. A final action additionally depends on benefits, costs, constraints, and policy.

Establish a non-ML baseline before fitting complex models. For regression, this might be the recent mean, median, or a simple seasonal rule. For classification, it might be the base rate, an existing rule, or a small linear model. The baseline reveals whether available predictors add information and sets a cost-performance floor. Beating a weak constant baseline is not enough when an established operational rule is stronger.

Finally, define the population over which performance is claimed. Historical examples are not automatically representative of future traffic. Eligibility filters, geography, device types, product tiers, and collection periods determine scope. A model card or system contract should say where the model was evaluated and where evidence is absent.

## 2. Splits, Evaluation Protocols, and Leakage

Generalization performance must be estimated on observations not used to choose the fitted system. A basic workflow separates data into training, validation, and test roles. Training data fit parameters. Validation data guide feature choices, model families, hyperparameters, and thresholds. The test data are held back until those choices are fixed, providing a final estimate for the selected procedure.

The conceptual separation matters more than the number of physical files. Cross-validation can provide validation estimates within a development set. A single untouched test set can then assess the completed pipeline. If test results influence another design iteration, the test set has become validation data; repeated adaptation gradually overfits the test set even without directly fitting its labels.

Rows should be split according to how new predictions arrive. A random row split is plausible when future cases are exchangeable, independent units from the same stable population. It is inappropriate when observations share entities, groups, time, or spatial context. If one person contributes several visits, placing some visits in training and others in testing may let the model recognize person-specific patterns. A group-based split keeps all rows from one entity on one side.

Time-ordered prediction normally requires a temporal evaluation: train on earlier data and evaluate on later data. This preserves the direction of information and exposes drift. Randomly mixing dates can train on events that occur after test cases, producing an estimate for an impossible system. When labels mature slowly, include a gap or cutoff that prevents partially observed outcomes from contaminating the evaluation.

Spatial or organizational transfer may require holding out entire sites, regions, devices, or clients. The relevant test is determined by the deployment claim. A model meant to serve new facilities should be evaluated on facilities absent from training, not merely on new rows from familiar facilities.

**Target leakage** occurs when a predictor contains the target or information caused by events after the prediction cutoff. Direct examples include a “case closed” field used to predict resolution and an aggregate calculated over a window that extends past prediction time. Indirect leakage is often harder: a missing-value pattern may reveal which cases later entered a special workflow; an identifier may encode acquisition date; a downstream professional decision may closely reveal the final label.

**Train-test contamination** occurs when information from evaluation rows influences training transformations or choices. Computing normalization statistics on the full data, selecting features using all labels, oversampling before splitting, or imputing with global values allows evaluation information to enter the fitted pipeline. Each learned transformation must be fitted only on its training partition and then applied unchanged to held-out data.

Duplicate and near-duplicate examples are another contamination route. The same document, image, transaction, or templated event may appear under different identifiers. A random split then tests memorization of shared content. Deduplication rules and grouping keys should be derived from the underlying data-generating process, not only exact row equality.

Leakage prevention is a provenance problem. For each feature, identify its source event, event time, ingestion time, aggregation window, and dependencies. Reproduce the prediction-time query as closely as possible during training. A feature store or pipeline does not guarantee correctness by itself; its temporal joins and backfills must preserve what would actually have been known.

An evaluation protocol should be frozen before broad model comparison. Record split keys, cutoff dates, exclusions, label-maturity rules, metrics, and uncertainty method. This makes the test result evidence about a specified procedure rather than a favorable number selected from many invisible alternatives.

## 3. Representation, Preprocessing, and Fitted Pipelines

Models consume numerical representations, but those representations should preserve semantics relevant to the task. Preprocessing is part of the fitted model. It must be learned within each training split, serialized with the predictor, and reproduced exactly at inference time.

Numerical variables may need scaling. Standardization commonly subtracts a training mean and divides by a training standard deviation. This changes optimization geometry and makes regularization penalties treat coefficients on different scales more comparably. It does not make a skewed variable normal, remove outliers, or add information. Tree-based models are usually insensitive to monotonic scaling because their splits depend on order, while gradient-based linear models can be sensitive to feature scale.

Transformations such as logarithms can make multiplicative relationships more nearly additive and reduce the influence of large values. They also change interpretation and require rules for zeros and negative values. Any clipping boundary or transformation parameter must be fitted or fixed without consulting held-out outcomes.

Categorical variables require an encoding. One-hot encoding creates indicators for categories. High-cardinality identifiers can create sparse, unstable features and enable memorization. Target-derived encodings can be useful but are especially leakage-prone: category statistics for a training row must be calculated without using that row's target, and all calculations must remain inside the training fold.

Ordinal categories should be encoded with their genuine order only when equal numerical gaps are defensible or when the model can otherwise respect order without inventing distance. Arbitrary integer codes can lead a linear model to assume that category 4 is twice category 2.

Missingness needs an explicit policy. Some algorithms require imputation; others can route missing values internally. Median or mode imputation is simple, but the imputed value is not an observed fact. A missingness indicator can retain information about the absence itself. That information may be predictive because of a stable measurement process, or brittle because it reflects a temporary workflow. Distinguish values that are absent, structurally inapplicable, delayed, or corrupted when the domain permits.

Text, images, and sequences require richer representations, but the same contracts hold: representation training must not consume held-out labels or future data in a way inconsistent with deployment. A pretrained representation can carry broad information, while any adaptation on the task data becomes part of model selection and must be evaluated accordingly.

Feature engineering can encode domain structure. Ratios, rates, lags, rolling summaries, and interactions can make useful relationships easier to learn. Every feature needs defined units and valid domains. Ratios become unstable near a zero denominator. Rolling windows need exact inclusivity and time-zone rules. Aggregates must specify which historical events were available at the cutoff.

A **pipeline** composes transformations and the estimator into one fitted object or equivalent reproducible graph. During cross-validation, the entire pipeline is fitted separately in each training fold. This prevents the validation fold from influencing imputation, scaling, dimensionality reduction, or feature selection. In production, the same pipeline ensures that column order, category handling, transformations, and model coefficients stay synchronized.

The inference contract should also define behavior for unknown categories, out-of-range values, missing columns, schema changes, and malformed records. Silent substitution can keep a service available while degrading predictions invisibly. Depending on risk, the safer behavior may be to reject the record, fall back to a baseline, or produce a prediction with an explicit quality flag.

## 4. Objectives, Optimization, and What Training Actually Minimizes

Training usually minimizes an empirical objective. For observations `(xi, yi)`, predictions `f(xi)`, loss function `L`, and regularization term `Omega`, a common form is

`objective = average of L(yi, f(xi)) + lambda × Omega(f)`.

The loss defines how prediction errors are scored on the training sample. The regularizer prefers some fitted functions over others. The optimization algorithm searches the parameter space for a low objective. These are three separate design choices, and none alone guarantees useful decision performance.

For regression, squared-error loss is

`L(y, prediction) = (y - prediction)²`.

Squaring emphasizes large residuals and leads a well-specified model toward the conditional mean. It can be sensitive to extreme outcomes. Absolute-error loss, `|y - prediction|`, targets a conditional median and gives large residuals less disproportionate influence. Other losses can focus on quantiles or use domain-specific asymmetry. Choosing a loss implies what aspect of the conditional outcome distribution the model estimates.

For binary classification, a model often produces a probability-like value `p`. Log loss is

`L(y, p) = -[y log(p) + (1 - y) log(1 - p)]`.

It rewards assigning high probability to the observed class and strongly penalizes confident mistakes. Under suitable conditions, minimizing expected log loss recovers true conditional probabilities. A classifier trained with log loss still needs calibration evaluation because finite samples, regularization, misspecification, and shift can distort its probabilities.

Class weights and resampling alter the effective training objective. They may help optimization attend to rare classes, but they can also change the apparent class prevalence and probability calibration. A weighted model's raw output should not automatically be interpreted as an operating-population probability. Evaluate and, if necessary, calibrate it on data with the intended prevalence.

Gradient-based optimization updates parameters using local derivatives of the objective. A learning rate controls step size. Too large a step can diverge or oscillate; too small a step can waste computation or stall. Stochastic and mini-batch methods use subsets of observations to estimate gradients, introducing noise that can aid scale and sometimes exploration. Convergence of the training objective is not evidence of generalization; it only says the optimizer has found a stable region for the chosen sample and objective.

Nonconvex models can have many parameter configurations with similar training loss. Initialization, batch order, and numerical details can affect the result. Repeated runs help quantify this optimization variability when it is material. Convex objectives for regularized linear models are simpler: a global optimum can often be found, although data and modeling uncertainty remain.

Early stopping uses held-out or internal validation performance to end iterative fitting before training loss reaches its minimum. It acts as regularization because later iterations may increasingly fit sample-specific noise. Since the stopping time is selected from validation behavior, it belongs inside the model-selection protocol and must not inspect the final test set.

Optimization metrics are often surrogates for operational utility. Log loss is differentiable and statistically meaningful, while the eventual action may depend on a threshold, review capacity, or uneven costs. Train with a stable objective, then validate the complete decision rule on metrics aligned with use. Directly optimizing a noisy business total can overfit unless its structure and uncertainty are carefully handled.

## 5. Generalization, Capacity, Bias–Variance, and Regularization

The central goal is low expected loss on new cases, not minimal training loss. A model **underfits** when its representation or constraints cannot capture useful structure. It **overfits** when it captures peculiarities of the training sample that do not repeat. Both can coexist in different regions or subgroups.

Model capacity describes the range of functions a method can express. Capacity rises with more parameters, deeper trees, weaker regularization, richer interactions, or more flexible features, but parameter count alone is not a universal measure. Optimization behavior and structural assumptions also shape effective capacity.

The bias–variance perspective describes two sources of prediction error across hypothetical training samples. High bias means the learning procedure systematically misses structure, as when a straight line represents a strongly curved relationship. High variance means the fitted function changes substantially when the training sample changes. Flexible procedures can reduce bias while increasing variance. Noise in outcomes creates error that no predictor based on available features can remove.

This decomposition is a reasoning tool, not a command to prefer a medium-complexity model in every case. More data can stabilize a high-capacity model. Strong structural assumptions can give a large model useful inductive bias. The relevant trade-off is empirical performance under the actual data size, shift, and decision constraints.

**Regularization** restricts or penalizes fitted functions. In linear models, an L2 penalty adds the sum of squared coefficients and tends to shrink correlated predictors smoothly. An L1 penalty adds the sum of absolute coefficients and can set some coefficients to zero. The penalty is usually applied after features are placed on comparable scales. A regularization strength is a hyperparameter selected using validation data.

Tree depth limits, minimum leaf sizes, feature subsampling, and learning-rate constraints are also forms of regularization. Data augmentation, parameter sharing, and early stopping can serve the same general purpose: they reduce sensitivity to idiosyncrasies of the finite sample by encoding which solutions should be preferred.

**Learning curves** plot training and validation performance against training-set size. If both performances are poor and close, the model may be bias-limited or features may lack signal. If training performance is much better than validation performance, variance or mismatch may dominate. If validation continues to improve as data increase, more representative labeled data may help. Learning curves diagnose the whole procedure, so they must preserve grouped or temporal split rules.

Regularization does not fix leakage, target defects, or population mismatch. A perfectly regularized model can still exploit a post-outcome field. Likewise, a model that generalizes within an old distribution can fail after a policy change. Generalization evidence is always relative to the evaluation population and protocol.

Model stability matters when predictions drive repeated decisions. If small changes in data cause large changes in selected features, thresholds, or subgroup behavior, report that instability even when average metrics look similar. Resampling, coefficient paths, prediction disagreement, and sensitivity analyses can reveal fragile choices.

The simplest model that meets the operating requirements is often preferable because it is easier to inspect, reproduce, and monitor. Simplicity is not a goal above performance and safety, however. A simple misspecified model may create systematic errors that a more flexible model avoids. Complexity should earn its operational cost through credible held-out improvement or necessary behavior.

## 6. Cross-Validation, Hyperparameter Search, and Model Selection

Cross-validation estimates how a learning procedure performs across multiple train-validation splits. In `k`-fold cross-validation, the development data are partitioned into `k` folds. Each fold serves once as validation while the others train the pipeline, and fold metrics are aggregated. Every learned preprocessing step must be refitted inside each fold.

Ordinary random folds assume exchangeable rows. Grouped data require grouped folds; time-dependent tasks require forward or blocked validation; spatial transfer may require location-based folds. A numerically convenient split that violates the deployment structure produces a precise answer to the wrong question.

Fold variability is informative but is not a simple confidence interval for future performance. Folds overlap in training data and may differ in composition. Report their distribution and important subgroup results, while using an uncertainty method matched to the intended claim when formal intervals are needed.

Hyperparameters control the learning procedure rather than being directly fitted as ordinary model parameters. Examples include regularization strength, tree depth, number of estimators, feature-selection thresholds, and learning rates. Search procedures may be grids, random samples, adaptive optimization, or staged expert choices. The key statistical fact is that testing many configurations on the same validation signal can overfit that signal.

Keep the search space justified and bounded. A larger search is not automatically better when validation data are limited. Compare configurations using a prespecified primary metric and constraints, rather than selecting whichever metric looks favorable afterward. Secondary metrics, subgroup behavior, latency, memory use, and calibration can act as acceptance constraints or tie-breakers.

When an unbiased estimate of the entire tuning procedure is important and data permit, **nested cross-validation** separates an inner selection loop from an outer evaluation loop. Each outer training portion conducts its own inner hyperparameter search, and the outer held-out portion evaluates the selected result. This estimates the procedure, not one final fitted object. It can be expensive and is not a substitute for a final temporally appropriate test or deployment monitoring.

After selecting a configuration, refit the complete pipeline on the allowed development data, then evaluate once on the untouched test set. If the final test reveals a defect that causes redesign, acknowledge that the test informed development and obtain new independent evidence when the risk warrants it.

Model selection should account for uncertainty and practical equivalence. Tiny average differences between candidates may be smaller than split variability. Prefer the less complex or more operationally robust system when performance is indistinguishable for the decision. Conversely, a modest average gain may matter if it occurs in a high-cost region and remains stable.

Threshold selection is also model selection. Choosing a classification cutoff to maximize validation utility and then reporting utility on the same data is optimistic. Select thresholds within training or validation loops and assess the chosen rule on held-out data. If thresholds will adapt to capacity or prevalence in production, evaluate that adaptive policy rather than one fixed cutoff.

## 7. Linear Regression and Logistic Classification

Linear models combine features additively:

`f(x) = beta0 + beta1 x1 + ... + betap xp`.

For ordinary linear regression, `f(x)` estimates a conditional mean under squared-error fitting. Each coefficient represents the modeled change in the prediction for a one-unit increase in that feature while other represented features stay fixed. The interpretation depends on feature transformations and interactions. A coefficient on a standardized feature uses standard-deviation units; a coefficient inside a logarithm or product term does not have the simple raw-unit meaning.

Linearity refers to coefficients, not necessarily raw inputs. Basis functions can represent curves, seasonal effects, and interactions while remaining a linear model in transformed features. This flexibility must be regularized and evaluated like any other capacity increase.

Strongly correlated predictors make individual coefficients unstable because several combinations can yield similar predictions. Predictive performance may remain stable while signs and magnitudes shift across samples. Coefficient interpretation then needs uncertainty, domain structure, and awareness that prediction-oriented regularization changes estimates.

Residual diagnostics compare observations with fitted values. Structure in residuals can reveal nonlinearity, unequal variance, missing interactions, or distinct subpopulations. Extreme influential points can substantially determine a fitted line. These diagnostics test modeling assumptions; they do not certify causal interpretation.

For binary classification, logistic regression models the log odds of the positive class:

`log[p / (1 - p)] = beta0 + beta1 x1 + ... + betap xp`.

The logistic transformation maps any real-valued score to a probability between 0 and 1. A one-unit increase in a feature multiplies modeled odds by `exp(beta)` while other represented features remain fixed. Odds are `p / (1 - p)`, not probability itself; the same odds multiplier produces different absolute probability changes at different baselines.

Logistic regression creates a linear decision boundary in its represented feature space. Interactions and nonlinear basis functions can expand it. Regularization is often essential with many or correlated predictors, rare categories, or near-separable classes. Complete separation can otherwise drive coefficient estimates toward extreme values.

Linear and logistic models are valuable baselines because their inductive bias is explicit, training is efficient, and behavior can often be inspected. They can outperform more flexible models when data are limited or relationships are approximately additive. They can fail when important interactions, discontinuities, or heterogeneous effects are not represented.

Coefficients are not automatically explanations. A model can use a variable as a proxy for omitted processes, and holding observed predictors fixed does not simulate an intervention. Interpretability should be tied to a question: global functional form, local prediction sensitivity, data dependence, or causal effect. Each requires different evidence.

## 8. Decision Trees and Ensembles

A decision tree partitions feature space through a sequence of rules. Each internal node chooses a feature and split, and each leaf produces a prediction. Regression leaves may predict an average outcome; classification leaves may predict class proportions or scores. Trees naturally represent interactions because later splits depend on earlier paths.

Individual trees are easy to visualize when shallow, handle nonlinearities and mixed scales, and do not require numerical feature standardization. They are also unstable: a small data change can alter an early split and restructure the tree. Deep trees can isolate tiny groups and overfit.

Tree regularization includes limiting depth, requiring enough observations for a split or leaf, restricting candidate features, and pruning. Impurity criteria select splits that make child nodes more homogeneous in their targets. Greedy split construction optimizes local choices and does not guarantee the globally best tree.

Ensembles combine multiple trees to reduce errors. **Bagging** fits trees to perturbed samples and averages their predictions. When individual trees have variance and imperfectly correlated errors, averaging stabilizes the result. Random feature selection at splits further decorrelates trees. This produces a random-forest-style ensemble: strong nonlinear prediction with relatively little preprocessing, at the cost of reduced direct interpretability and larger inference work.

**Boosting** builds trees sequentially, with each stage focusing on residual structure or gradients of the objective left by the current ensemble. Small trees act as weak components, and their weighted sum forms a flexible function. Learning rate, number of stages, depth, and sampling control capacity. Too many aggressive stages can overfit, while conservative learning may require more stages.

Tree ensembles can handle thresholds, interactions, and nonlinear effects without manual basis design. They do not extrapolate linear trends naturally beyond the observed feature range: predictions are assembled from learned regions. For a regression task where values outside the training range matter, this behavior should be tested explicitly.

Missing-value and categorical handling vary by implementation and configuration, so the production contract must state the chosen behavior rather than assume that all tree systems behave alike. High-cardinality variables and identifiers can still encourage memorization. Monotonic constraints or other structural constraints can encode domain knowledge when supported, but they are modeling assumptions that need validation.

Feature importance is not a single fact. Split-based importance can favor variables with many possible split points. Permutation importance measures performance loss after disrupting a feature, but correlated substitutes can make each appear individually unimportant. Local attribution methods allocate a prediction among represented features under a chosen background distribution; they do not reveal causal responsibility. Importance results should name their method and question.

Ensembles often improve ranking performance, but their probability outputs may need calibration. As with every model, selection and calibration must occur within the development protocol, and final performance must be measured on data that were not used for either choice.

## 9. Metrics, Calibration, Thresholds, and Subgroup Behavior

A metric compresses behavior, so it should be chosen from the decision and error costs. For regression, mean absolute error reports average absolute deviation in target units. Root mean squared error takes the square root of average squared error and emphasizes large misses. Quantile loss evaluates quantile forecasts. Relative percentage errors can become unstable near zero and can weight low-valued cases disproportionately.

Always compare error with the target distribution and a baseline. The same mean absolute error can be excellent or useless depending on scale and irreducible variation. Inspect residuals over predicted value, time, major subgroups, and operationally important ranges. An average can conceal systematic underprediction at the high end.

For binary classification, a threshold turns scores into predicted classes. The resulting confusion matrix contains true positives, false positives, true negatives, and false negatives. From it:

- **Precision** is the fraction of predicted positives that are truly positive.
- **Recall**, or sensitivity, is the fraction of actual positives detected.
- **Specificity** is the fraction of actual negatives correctly rejected.

These quantities depend on threshold, and precision also depends strongly on prevalence. A model can retain similar sensitivity and specificity after moving to a population with a different base rate while its precision changes substantially.

The ROC curve traces true-positive rate against false-positive rate across thresholds. Its area measures the probability that a randomly selected positive receives a higher score than a randomly selected negative, with ties handled appropriately. It is a ranking summary, not a measure of calibration or decision value. In rare-event problems, a small false-positive rate can still create many false alarms, so precision-recall views and absolute counts may be more informative.

Log loss and the Brier score evaluate probability quality rather than only ranking. **Calibration** asks whether events assigned probability near `p` occur about fraction `p` in the relevant population. Calibration can be checked with grouped reliability plots and proper scoring rules, with enough data to show uncertainty. A model may rank cases well yet be overconfident, or be calibrated on average while miscalibrated within important regions.

Calibration methods fit a mapping from raw scores to probabilities using held-out development predictions. Fitting the calibrator on the same predictions used to train a flexible base model can overfit. The calibration population should match deployment prevalence and conditions; calibration can deteriorate under shift and therefore needs monitoring.

A decision threshold should reflect expected consequences. With calibrated probability `p`, a simplified rule compares expected benefit and cost, but real systems may include limited review capacity, delayed feedback, repeated interventions, and constraints across groups. Evaluate the actual policy: top-k selection, abstention, multiple thresholds, or human review. The model score is an input to policy, not the policy itself.

Abstention can improve safety when the system can identify cases outside its competence, but uncertainty scores do not automatically detect all failures. A model may be confidently wrong on shifted data. An abstention rule needs held-out evaluation and an operational fallback.

Aggregate performance can hide subgroup failures. Report metrics for groups defined by the use case, measurement process, and plausible risks. Small groups produce noisy estimates, so include counts and uncertainty rather than ranking groups by unstable point estimates. Group metrics can conflict: equalizing one error rate may change another because base rates and score distributions differ. There is no purely mathematical metric that settles the policy question.

Evaluation should also inspect intersections and continuous variables where categorical bins would hide patterns. Fairness concerns include data coverage, label validity, feature proxies, access to beneficial actions, and the downstream effects of errors. Metric parity alone does not establish that a system is fair or useful.

## 10. Distribution Shift, Deployment, and the Prediction Lifecycle

Offline evaluation assumes a relationship between evaluation data and deployment. **Distribution shift** occurs when that relationship changes. In covariate shift, the distribution of predictors changes. In label shift, class prevalence changes while class-conditional feature behavior is assumed more stable. In concept shift, the relationship between predictors and target changes. These labels are idealized; real changes can combine them.

Shift can arise from seasonality, market changes, new sensors, changed data pipelines, policy updates, adversarial adaptation, or the model's own interventions. Once predictions influence who receives treatment, which cases are reviewed, or which outcomes are recorded, the model becomes part of the data-generating process.

Training-serving skew is a special operational mismatch. Feature logic, category mappings, units, default values, or time windows differ between offline training and online inference. Prevent it by sharing transformations where practical, versioning schemas, replaying production requests through the offline pipeline, and comparing feature distributions and prediction parity before release.

Deployment validation should test more than model serialization. It should cover schema failures, latency, throughput, numerical parity, fallback behavior, threshold configuration, logging, access controls, and the complete action path. A correct probability that is displayed to the wrong operator or interpreted as a mandatory action can still fail the system goal.

Monitoring has several layers. Service monitoring covers availability, latency, and malformed inputs. Data monitoring covers missingness, ranges, categories, and distribution changes. Prediction monitoring covers score distributions, action rates, and calibration where labels arrive. Outcome monitoring covers decision value, error costs, and subgroup effects. Each alert needs a response: investigate, fall back, retrain, recalibrate, change policy, or stop using the model.

Not every distribution change harms performance, and some harmful concept changes barely alter marginal feature distributions. Drift statistics are warning signals, not proof of model failure. Whenever labels become available, direct performance evaluation is stronger. When labels are delayed or selectively observed, monitoring must account for that selection rather than treating observed outcomes as representative.

Feedback labels need provenance. Outcomes may arrive late, be revised, or be missing because the model changed which cases were inspected. Retraining on model-influenced data can amplify blind spots. Preserve prediction-time features, model version, score, action, and eventual outcome so performance can be reconstructed without using corrected future fields as if they were known earlier.

Recalibration, threshold changes, and retraining solve different problems. If ranking remains useful but prevalence changes, recalibration or a policy adjustment may suffice. If feature-outcome relationships change, retraining on representative recent data may be necessary. If the target no longer represents the desired decision, no fitting update repairs the framing.

Champion-challenger evaluation can compare a proposed model with the current system on the same incoming population. Shadow deployment exercises data and prediction paths without changing user-facing actions. Controlled experiments can measure the causal effect of acting on predictions, which offline predictive metrics cannot establish by themselves.

Every released model should be traceable to data definitions, code or pipeline identity, feature contracts, hyperparameters, calibration, threshold policy, evaluation artifact, and approval state. Rollback should restore the complete compatible bundle, not only coefficient values. Retention and access policies should match the sensitivity of training and prediction records.

A supervised-learning system remains valid only while its assumptions, data, and decision context remain close enough to those tested. The durable workflow is therefore cyclical: frame the decision, define temporal data contracts, build leakage-resistant evaluation, fit reproducible pipelines, select with held-out evidence, evaluate probabilities and actions, deploy with fallbacks, and monitor the data-generating process that the deployment itself may alter.
