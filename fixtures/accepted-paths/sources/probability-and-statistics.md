# Probability and Statistics

Probability and statistics are tools for reasoning when the facts are incomplete. Statistics begins with observations: measurements, categories, records, or outcomes collected from some part of the world. Probability begins with a model of uncertainty: a description of which outcomes are possible and how plausible they are. The two fields meet when we use a sample to learn about a larger population. Probability describes how samples can vary, and statistics uses that variation to say what the data do and do not support.

The central habit is to keep three things distinct:

- what was observed in the data;
- what a statistical model assumes about the process that produced the data;
- what conclusion is justified for the population or decision of interest.

A calculation can be correct while the conclusion is poor. A precise average from a biased sample is still biased. A tiny probability under a model does not prove that a preferred explanation is true. A strong association does not by itself show that changing one variable will change another. Sound statistical reasoning depends on how data were produced as much as on arithmetic.

## 1. Data, Variables, Populations, and Samples

A **unit of observation** is the kind of thing represented by one record: a person, household, transaction, tree, machine cycle, day, or experiment. A **variable** is a property recorded for each unit. Before analyzing a table, ask what one row represents. Two columns can appear comparable while referring to different units or time periods, and repeated measurements from the same unit are not automatically independent observations.

Variables can be **categorical** or **quantitative**. A categorical variable places a unit in a group, such as payment method, plant species, or whether a device failed. Categories may be unordered, or they may have a meaningful order such as low, medium, and high. A quantitative variable records an amount for which numerical differences have meaning, such as duration, temperature, or distance. Counts are usually discrete: they take separated values such as 0, 1, or 2. Measurements are often treated as continuous because values within an interval are possible in principle, even if the instrument rounds them.

The distinction matters because it determines sensible summaries. The mean of travel times can be meaningful; the mean of category labels usually is not. A numerical code assigned to categories does not turn them into measured quantities. The coding `1 = bicycle`, `2 = bus`, and `3 = walking` is useful for storage, but an average code of 2.1 has no natural interpretation.

The **population** is the complete set of units about which a question is asked. A **sample** is the subset actually observed. A population need not mean every human in a country. It might be all packages processed by one facility this month, all future outputs of a manufacturing line under current settings, or all eligible visitors to a service. Defining the target population precisely prevents a result from silently expanding beyond its evidence.

A numerical feature of a population is a **parameter**. Examples include a population mean, a population proportion, or the difference between two population means. A number computed from a sample is a **statistic**. The sample mean is a statistic used to estimate the population mean. A statistic changes from sample to sample; the parameter is treated as fixed but unknown for the question at hand.

How a sample is selected determines whether it can represent the population. In a **probability sample**, each unit has a known, nonzero route into the sample. A simple random sample gives every set of a given size an equal chance of selection. Stratified sampling first divides the population into relevant groups and samples within each group. Cluster sampling selects groups of units, which can reduce collection cost but often produces observations that resemble one another.

A convenient sample can be large and still misleading. A voluntary online poll overrepresents people who noticed it and chose to respond. A customer survey sent only after a successful purchase misses abandoned purchases. A health estimate based on people who can reach a particular clinic misses those without access. These are forms of **selection bias**: the mechanism producing the sample is related to the quantities being studied.

**Nonresponse** creates another gap when selected units do not provide usable information. Weighting can sometimes adjust for known differences between the sample and population, but it cannot reliably repair unmeasured differences without assumptions. More data reduce random sampling noise; they do not automatically remove systematic bias.

Missing values also have a mechanism. Data may be missing for reasons unrelated to the missing value, related to other observed variables, or related to the missing value itself. For example, an income field left blank may be more common at very high or very low incomes. Deleting every incomplete row can then change the population represented by the analysis. A responsible report states what is missing, how much is missing, and what assumptions underlie the chosen treatment.

An **observational study** records what already occurs. An **experiment** deliberately assigns an intervention or condition. Random sampling and random assignment solve different problems. Random sampling supports generalization from a sample to its target population. Random assignment supports causal comparison by making treatment groups comparable on average before the intervention. A study may have one without the other: a randomized experiment on a narrow volunteer group can estimate a causal effect for that setting while still generalizing poorly to a broader population.

Good data work begins before calculation. State the unit, variables, target population, sampling or assignment process, time window, exclusions, and measurement definitions. These choices form the bridge between a numerical result and the claim it can support.

## 2. Describing Distributions: Center, Spread, Shape, and Context

A **distribution** describes which values a variable takes and how often. For categorical data, counts and proportions usually reveal the distribution. If 80 of 200 observed orders used a particular delivery method, the sample proportion is `80 / 200 = 0.40`, or 40%. Proportions make groups of different sizes easier to compare, but the underlying counts still matter because a proportion based on 20 observations is less stable than the same proportion based on 20,000.

For quantitative data, no single summary tells the whole story. Describe at least the **center**, **spread**, **shape**, and any unusual features. A histogram groups values into intervals and shows their frequencies. A dot plot or strip plot preserves individual observations in a small data set. A box plot compresses the distribution into quartiles and highlights possible extremes. Graphical choices such as bin width and axis scale can alter what patterns are visible, so a graph should be read as a representation, not as the data themselves.

The **mean** is the sum of the observations divided by their number:

`mean = (x1 + x2 + ... + xn) / n`.

The mean is the balance point of the values. It uses every observation, which makes it informative but sensitive to extreme values. For five delivery times of 8, 9, 9, 10, and 44 minutes, the mean is 16 minutes, even though four of the five times are at most 10 minutes.

The **median** is the middle value after sorting. If the number of observations is even, it is usually defined as the average of the two middle values. The median resists extreme observations. In the delivery-time example, the median is 9 minutes. Neither measure is universally better: the mean represents total amount per unit and is central to many models, while the median represents a typical rank and is often clearer for strongly skewed data.

The **mode** is a most frequent value. It is especially useful for categorical data, and a distribution may have more than one mode. For continuous measurements, the apparent mode can depend on rounding or histogram bins.

Spread describes how far values lie from one another. The **range** is maximum minus minimum, but it depends entirely on two observations. The **interquartile range**, or IQR, is the third quartile minus the first quartile. It spans the middle half of the ordered observations and is resistant to extremes.

The **variance** uses all observations. For a sample, it is commonly calculated as

`s² = sum of (xi - sample mean)² / (n - 1)`.

Each deviation from the mean is squared so that negative and positive deviations do not cancel. Dividing by `n - 1` makes the sample variance behave appropriately as an estimator of population variance. The **standard deviation**, `s`, is the square root of variance, so it returns to the variable's original units. Roughly speaking, it describes a typical distance from the mean, although its exact interpretation depends on distribution shape.

The shape may be symmetric or skewed, have one main cluster or several, and contain gaps or extreme values. A **right-skewed** distribution has a long tail toward larger values; income and waiting time often have this shape. The mean is usually pulled toward the long tail. Multiple clusters can indicate hidden groups, such as measurements from two different machines. Combining groups can conceal important structure even when the combined mean is calculated correctly.

An **outlier** is an observation unusually far from the rest under some stated criterion. It is not automatically an error. It might be a data-entry mistake, a rare but genuine case, or evidence that the assumed model misses a subgroup. Investigate the observation and the measurement process before excluding it. Report analyses whose conclusions change substantially when reasonable treatments of unusual values are used.

Standardized values allow comparison across scales. A **z-score** is

`z = (observed value - mean) / standard deviation`.

A z-score of 1.5 means the value is 1.5 standard deviations above the mean. It does not by itself give a probability. Translating z-scores into tail probabilities requires a distributional model, often a normal approximation.

Summaries should retain context. “The mean rose by 4” is incomplete without units, baseline, time window, and group definition. A relative change can also exaggerate a small absolute difference: an increase from 1 in 10,000 to 2 in 10,000 is a 100% relative increase but an absolute increase of 1 in 10,000. Showing both absolute and relative quantities helps a reader judge practical importance.

## 3. Probability, Conditional Probability, and Independence

A probability assigns a number from 0 to 1 to an event. Zero represents impossibility within the model, one represents certainty within the model, and values between them represent degrees of uncertainty. An **outcome** is one possible result, a **sample space** is the set of possible outcomes, and an **event** is a set of outcomes that share a feature of interest.

Probabilities can arise from a physical symmetry, a long-run frequency model, or a quantified state of information. What matters is that the interpretation and assumptions are clear. Saying a machine has a 2% daily failure probability might mean repeated days under stable operating conditions would fail about 2% of the time. It does not mean failure is mechanically scheduled once every 50 days.

For mutually exclusive events, which cannot occur together, probabilities add. If a device status must be either “minor fault” or “major fault” and never both, then

`P(minor or major) = P(minor) + P(major)`.

For general events `A` and `B`, overlap must be subtracted once:

`P(A or B) = P(A) + P(B) - P(A and B)`.

The **complement** of an event is its failure to occur. Therefore

`P(not A) = 1 - P(A)`.

This is often the simplest way to calculate “at least one.” If independent attempts each succeed with probability 0.20, the probability of at least one success in three attempts is one minus the probability that all three fail: `1 - 0.80³ = 0.488`.

A **conditional probability** updates the reference group. `P(A | B)` means the probability of `A` among cases where `B` is known to have occurred:

`P(A | B) = P(A and B) / P(B)`, provided `P(B) > 0`.

Suppose 1,000 messages include 100 urgent messages. Of those urgent messages, 30 contain an attachment. Then `P(attachment | urgent) = 30 / 100 = 0.30`. If 200 messages contain attachments altogether, `P(urgent | attachment) = 30 / 200 = 0.15`. Reversing the condition changes the denominator, so these two probabilities are generally different.

This reversal is a common source of mistakes in screening and classification. The probability of a positive result given a condition is not the probability of the condition given a positive result. The latter also depends on how common the condition is in the relevant population.

Bayes' rule expresses that relationship:

`P(A | B) = P(B | A) P(A) / P(B)`.

The probability `P(A)` before observing `B` is often called the prior probability. The likelihood term `P(B | A)` describes how compatible the evidence is with `A`. The resulting `P(A | B)` is the updated or posterior probability. Bayes' rule is ordinary conditional probability viewed as an update: evidence that is common both when `A` holds and when it does not hold may change belief very little.

Two events are **independent** if learning that one occurred does not change the probability of the other. Equivalent statements include

`P(A | B) = P(A)`

and

`P(A and B) = P(A) P(B)`.

Independence is not the same as mutual exclusivity. If two non-impossible events are mutually exclusive, observing one makes the other impossible, so they are dependent. Independence is usually a modeling claim that needs justification. Repeated measurements from the same person, neighboring locations, and consecutive machine outputs may share influences and therefore be dependent.

Conditional independence can hold even when ordinary independence does not. Umbrella use and traffic delays may be associated because both respond to rain. Within days of the same weather state, the remaining association may be small. The weather variable helps explain the dependence. This idea underlies adjustment for confounding, graphical models, and many predictive methods.

Probability models simplify reality. Their value is not that they remove uncertainty but that they make assumptions and consequences explicit. When a result depends strongly on an independence assumption or a rare-event probability, that dependence belongs in the conclusion.

## 4. Random Variables, Distributions, and Expectation

A **random variable** assigns a numerical value to each outcome of an uncertain process. The number of support requests arriving in an hour is a discrete random variable. The lifetime of a component is often modeled as continuous. The adjective “random” describes uncertainty before observation, not a claim that the process has no causes.

A probability distribution specifies the possible values and their probabilities or probability density. For a discrete random variable `X`, the probabilities `P(X = x)` sum to 1. For a continuous variable, probability is assigned to intervals; the probability of any one exact real-number value is usually treated as zero. A density curve can be higher than 1 at a point, but the total area under it is 1.

The **expected value** of a discrete random variable is its probability-weighted average:

`E[X] = sum of x P(X = x)`.

Expectation is a long-run center under repeated use of the model. It need not be a value that can occur. If a fair process pays 0 units half the time and 3 units half the time, the expected payoff is 1.5 units even though no single play pays 1.5. Expected value is useful for comparing repeated decisions, but a person facing a one-time loss may also care about risk, available reserves, and unequal consequences.

The variance of a random variable describes spread around its expectation:

`Var(X) = E[(X - E[X])²]`.

Its square root is the standard deviation. Expectations add even when variables are dependent: `E[X + Y] = E[X] + E[Y]`. Variances add directly for independent variables, but dependence introduces covariance terms. This is why diversification can reduce variability when components do not move together perfectly.

A **Bernoulli** random variable records one trial as 1 for success and 0 for failure, with success probability `p`. Its expectation is `p` and its variance is `p(1 - p)`. A **binomial** random variable counts successes in a fixed number `n` of independent trials with the same success probability. Its expectation is `np`. The binomial model is inappropriate when probabilities change sharply across trials or outcomes influence later outcomes.

The **normal distribution** is a symmetric, bell-shaped continuous model determined by a mean and standard deviation. Many measurement distributions are approximately normal near their center, and averages often become approximately normal under broad conditions. But not every variable is normal. Strong skew, hard boundaries, multiple populations, or rare extreme events can make a normal model misleading, especially in the tails.

A normal model makes standard deviations interpretable as probability regions. Approximately 68% of its probability lies within one standard deviation of the mean, about 95% within two, and nearly all within three. These are model-based approximations, not universal laws for arbitrary data.

Other distribution families encode different processes. Counts over time may resemble a Poisson distribution when events occur independently at a stable average rate. Waiting times may be right-skewed. Proportions are bounded between 0 and 1. The goal is not to force every variable into a familiar family, but to select a model whose assumptions preserve the features relevant to the question.

The **law of large numbers** says that under appropriate stable conditions, an average of many observations tends to approach its expected value. It does not say that short-run deviations must immediately correct themselves. After several coin-like outcomes of one kind, the next independent outcome keeps the same probability; the process has no memory of an imbalance.

The **central limit effect** concerns the distribution of a sum or average across repeated samples. With sufficiently many independent observations of finite variance, the sampling distribution of the mean often becomes approximately normal even when individual observations are not normal. How much data is “sufficient” depends on skew, tails, dependence, and the desired accuracy. This effect supports many inferential tools, but it does not repair biased sampling or make the raw data normal.

## 5. Sampling Variability and Interval Inference

Imagine repeatedly drawing random samples of the same size from one population and calculating the mean each time. The resulting collection of sample means is the **sampling distribution** of the mean. It describes how an estimator varies because of random sampling. This is a conceptual repeated-sampling distribution; an analyst usually observes only one actual sample.

The standard deviation of a sampling distribution is called a **standard error**. If observations are independent and the population standard deviation is `sigma`, the standard error of the sample mean is

`SE(mean) = sigma / square root of n`.

Because `sigma` is usually unknown, it is estimated with the sample standard deviation `s`. Increasing the sample size makes the standard error smaller, but the square-root relationship has diminishing returns. To cut the standard error in half, one needs about four times as many independent observations.

The formula depends on the design. Clustered observations contain less independent information than the same number of unrelated observations. Sampling a large fraction of a finite population can require a correction. Time series and spatial data may have correlation. Treating dependence as independence typically makes uncertainty look too small.

An **estimate** is a best-supported numerical value for a parameter under the method, while an **interval estimate** shows a range of values compatible with sampling uncertainty and assumptions. A common form is

`estimate ± critical multiplier × standard error`.

For a mean with unknown population standard deviation, a method based on the t distribution is often used. The multiplier depends on the desired confidence level and degrees of freedom. Larger confidence levels produce wider intervals because they demand a procedure that covers the true parameter more often across repetitions.

A 95% confidence interval has a repeated-procedure interpretation: if the full sampling and interval-building process were repeated many times under its assumptions, about 95% of the resulting intervals would contain the fixed population parameter. After one interval is calculated, the classical model does not treat the parameter as moving randomly between its endpoints. In ordinary communication, it is reasonable to say the interval gives a range of parameter values compatible with the data and method, as long as the assumptions are not hidden.

For a sample proportion `p-hat`, an approximate standard error is

`SE(p-hat) = square root of [p-hat(1 - p-hat) / n]`.

Simple approximations can perform poorly with small samples or proportions near 0 or 1, so alternative interval methods may be preferable. The general lesson is that a familiar formula is not a substitute for checking its conditions.

Intervals express sampling uncertainty, not every source of uncertainty. A narrow interval from a large nonrepresentative sample can be precisely wrong. Measurement error, nonresponse, data processing choices, model misspecification, and unrecorded confounders may dominate the displayed margin of error. A report should not let the decimal precision of an estimate exceed the quality of its data-generating process.

The **margin of error** is the multiplier times the standard error. It usually covers only a stated statistical model. It does not mean that every reported number lies within that distance of truth, nor does it account automatically for bias.

Interval width also separates statistical precision from practical usefulness. If an estimated average benefit is 2 units with a confidence interval from 1.8 to 2.2, the effect is precisely estimated, but whether it matters depends on costs and consequences. An interval from -2 to 8 is much less precise and may include both meaningful harm and meaningful benefit. Decisions should consider the full set of plausible effects, not merely whether zero lies inside the interval.

## 6. Hypothesis Tests, Errors, Effect Size, and Repeated Decisions

A hypothesis test asks how surprising the observed data would be if a specified **null hypothesis** and its modeling assumptions were true. A null hypothesis often represents no difference, no association, or a particular parameter value. An alternative hypothesis describes departures relevant to the question.

A **test statistic** measures how far the data depart from the null expectation relative to expected random variation. A **p-value** is the probability, assuming the null hypothesis and model are true, of obtaining a test statistic at least as incompatible with the null as the one observed. It is a statement about hypothetical data under the null. It is not the probability that the null hypothesis is true, and it is not the probability that the result happened “by chance.”

Suppose a null model predicts no average difference between two randomly assigned groups. A small p-value says that a difference at least this extreme would be unusual under that model. It can count against the null, but it does not identify which alternative explanation is true. A flaw in assignment, measurement, exclusions, or model assumptions can also create an unusual result.

A **significance level**, often denoted `alpha`, is a decision threshold chosen before examining the result. If the p-value is at most alpha, a rule may reject the null. This creates two familiar error types:

- A **Type I error** rejects the null when it is true. Under ideal conditions, alpha controls the long-run rate of this error for a single prespecified test.
- A **Type II error** fails to reject the null when a particular alternative is true. Its probability depends on the actual effect, sample size, variability, and decision rule.

**Power** is one minus the Type II error probability for a specified alternative. It is the probability that the test rejects the null when that alternative is true. Larger samples, lower noise, stronger effects, and sometimes a more permissive alpha increase power. Power should be planned around an effect size that would matter, not around any nonzero difference.

Failure to reject a null is not proof of no effect. It may mean the data are compatible with no effect, but it may also reflect an imprecise study. If the goal is to establish that effects are small enough to be practically equivalent, an equivalence design or interval compared with a meaningful tolerance is more informative than an ordinary nonsignificant result.

Statistical significance and practical importance are different. With enough observations, a negligible difference can produce a very small p-value. With few observations, an important difference can remain uncertain. Report an **effect size** in domain units, such as a difference in means, difference in proportions, risk ratio, or slope, together with an interval and context. Standardized effect sizes can aid comparison across scales, but they can obscure what the change means in actual outcomes.

Testing many hypotheses increases the chance of at least one false positive. If twenty independent null hypotheses are each tested at a 5% threshold, the probability of one or more false rejections is much larger than 5%. Methods that control family-wise error or false discovery rates can address a defined collection of tests. Better still, distinguish prespecified confirmatory questions from exploratory patterns generated after seeing the data.

Optional stopping, trying many exclusion rules, and reporting only favorable outcomes also alter the error properties of a test. Transparency about all measured outcomes, analyses, and decision points matters because the p-value formula assumes a particular procedure, not merely a final table.

Evidence accumulates through design quality, effect magnitude, precision, replication, and fit with other knowledge. A threshold is a decision convention, not a boundary between truth and falsehood. Results just above and just below a threshold are usually much more alike than the labels “not significant” and “significant” suggest.

## 7. Association, Regression, Prediction, and Causation

Two variables are **associated** when their distributions vary together. For quantitative variables, a scatterplot shows paired values. The **correlation coefficient** summarizes the direction and strength of a linear association on a scale from -1 to 1. Positive correlation means larger values of one variable tend to accompany larger values of the other; negative correlation means they tend to accompany smaller values. Correlation near zero means little linear association, but a strong curved relationship may still exist.

Correlation has no units and is unchanged by shifting or rescaling either variable. It is sensitive to outliers and to mixtures of groups. A high correlation does not imply that observations lie close to the line in practically useful units, and it does not establish causation.

**Linear regression** describes a conditional mean as a line. With one predictor `x`, a simple model is

`predicted y = intercept + slope × x`.

The slope is the modeled change in the mean of `y` associated with a one-unit increase in `x`. The intercept is the modeled mean when `x = 0`, which may or may not be meaningful within the observed range. A **residual** is observed `y` minus predicted `y`. Residual patterns can reveal curvature, changing spread, missing groups, or influential observations that the line does not capture.

The coefficient of determination, commonly written `R²`, is the proportion of observed variation in the outcome accounted for by the model relative to predicting the same mean for everyone. It does not measure causal importance, guarantee accurate predictions for individuals, or show that the model will generalize to a new population. Adding predictors to an ordinary fitted model cannot reduce its training R², even when the added variables are useless beyond the sample.

Multiple regression includes several predictors. A coefficient then describes an association with the outcome while holding the other included predictors fixed within the model. This can help compare otherwise similar cases, but “adjusted for” does not mean “all confounding removed.” The model may omit important causes, control for variables affected by the exposure, or rely on extrapolations where combinations of predictors were rarely observed.

A **confounder** is a common cause, or a suitable proxy for a common cause, of both the proposed exposure and the outcome. Suppose people who exercise more also have different work schedules, health histories, and access to safe spaces. An observed association between exercise and an outcome can reflect some combination of causal effect, selection, measurement, and these common causes.

Other causal traps include **reverse causation**, where the outcome influences the supposed cause, and **collider bias**, where selection or adjustment conditions on a common effect of two variables and creates an association. Restricting analysis to admitted patients, approved applications, or completed purchases can select on a process affected by several factors and distort relationships within the selected group.

Causal conclusions require a design and assumptions connecting comparisons to interventions. Random assignment is powerful because it balances both measured and unmeasured preexisting factors on average. In observational data, causal methods use substantive knowledge to select comparison groups, timing, adjustment variables, and assumptions. No regression command can decide those facts from correlations alone.

Prediction and causal explanation are different goals. A predictor can forecast an outcome well without causing it. A symptom may predict a condition while changing the symptom alone does not change the condition. Conversely, a policy can have a real average causal effect while individual outcomes remain difficult to predict.

Prediction also requires validation beyond the data used to fit the model. A flexible model can describe random peculiarities in a sample and fail on new observations. Holding out data, using resampling, and evaluating performance on the population and time period where the model will be used help estimate generalization. A model transported to a different setting may fail because measurement, behavior, prevalence, or relationships changed.

Statistical reasoning ends where it began: with the question and the data-generating process. Describe the sample honestly, summarize distributions before compressing them into models, use probability to quantify uncertainty, separate precision from importance, and distinguish association from intervention. The result is not certainty. It is a clearer account of what is known, what is assumed, and what remains uncertain.
