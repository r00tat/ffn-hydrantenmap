# Radiation protection

The radiation protection calculator combines tools for estimating dose rate, shielding, stay time, nuclide activity, fallout dose after a nuclear weapon detonation and unit conversion. All calculations run purely client-side in the browser.

:::info
You can reach the page via **Hazmat → Radiation protection**. For gamma spectroscopy and nuclide identification from RadiaCode measurements see [Energy spectrum](/docs/energiespektrum).
:::

:::warning
Note: The calculators provide a quick situational estimate. For real operation decisions the values of the dosimeters in use and the official limits and recommendations (radiation protection officer, region, radiation protection authority) are binding.
:::

## Features

- **Inverse square law** Compute the dose rate when the distance changes
- **Shielding factor** Reduction of the dose rate through several layers of shielding
- **Stay time** Permissible deployment time at a given dose rate and dose limit
- **Dose rate from nuclide activity** Dose rate at 1 m distance from activity and the nuclide-specific gamma constant
- **Nuclear weapon / fallout** Way-Wigner decay, total dose during stay in the fallout area, visualised as an FM 3-3-1 nomogram (Austrian STS silver competition)
- **Reference dose rate from measurement** Backcalculate R₁ at H+1 from a current measurement R(t)
- **Unit conversion** Sv / mSv / µSv / nSv, Gy, R and dose rates
- **Calculation history** Every calculator keeps the latest results including formula and values for documentation during the operation

## General operation

All calculators work in the same way: enter all variables except one and leave the field to be calculated **empty**. Clicking **Calculate** computes the missing value and adds the run to the history. **Clear** resets the inputs without discarding the history.

- Decimal separator: comma and dot are both accepted
- Empty inputs count as "unknown"
- Below the result every calculator shows the formula used and the values inserted – handy for transferring into the operation log

## 1. Inverse square law

The dose rate of a point source decreases with the square of the distance:

```
D1² × R1 = D2² × R2
```

Inputs: distance 1 (m), dose rate 1 (µSv/h), distance 2 (m), dose rate 2 (µSv/h). Fill exactly three fields and leave the fourth empty.

:::info
Example: 100 µSv/h measured at 1 m – what is the dose rate at 5 m distance? Fields: D1 = 1, R1 = 100, D2 = 5, R2 empty → R2 = 4 µSv/h.
:::

## 2. Shielding factor

When shielding with a material of shielding factor S, the dose rate is reduced by the factor S per layer:

```
R = R₀ / S^n
```

R₀ is the dose rate without shielding, R with n layers. Typical shielding factors (gamma radiation, guide value): lead S ≈ 2, steel S ≈ 1.5, concrete S ≈ 1.3 per half-value layer. If S is unknown the calculator determines it.

## 3. Stay time

How long may a responder remain at a given dose rate without exceeding a permissible dose?

```
t = D / R
```

t = stay time (h), D = permissible dose (mSv), R = dose rate (mSv/h). The result is also shown in days / hours / minutes / seconds so short stay times are immediately readable.

:::info
Reference values (ÖNORM S 5207): responders 15 mSv/year (general), 100 mSv once for the protection of life and limb, 250 mSv only for rescuing human lives – always coordinate the permissible dose with the radiation protection officer.
:::

## 4. Dose rate from nuclide activity

From the activity of a source and the nuclide-specific gamma constant Γ the dose rate at 1 m distance can be computed:

```
Ḣ = Γ × A
```

Γ has the unit µSv·m²/(h·GBq) and is stored for every nuclide in the library. The activity can be entered in Bq, kBq, MBq, GBq or TBq; internally the calculator converts to GBq. First pick the nuclide, then the unit and then either activity or dose rate – the empty field is computed.

:::info
Example: Cs-137 source with 10 MBq, what is the dose rate at 1 m? Nuclide: Cs-137, activity: 10 MBq, dose rate empty → result in µSv/h. For other distances convert the result via the *inverse square law*.
:::

## 5. Nuclear weapon / fallout (STS silver)

After a nuclear weapon detonation the dose rate in the fallout area approximately follows the Way-Wigner decay law (FM 3-3-1 "Nuclear Contamination Avoidance"):

```
R(t) = R₁ · t^(-1.2)
```

R₁ = reference dose rate at H+1 hour (mSv/h), t = hours after burst. Rule of thumb (7:10): after a sevenfold time the dose rate drops to roughly a tenth.

The accumulated dose during a stay starting at entry time Te for duration Ts is the integral:

```
D = 5 · R₁ · ( Te^(-0.2) − (Te + Ts)^(-0.2) )
```

Te and Ts are entered as separate hours and minutes fields (internally converted to decimal hours). Enter any three of the four quantities R₁, Te, Ts, D — the fourth is computed (Te via numerical bisection in log space).

:::info
FM 3-3-1 example: R₁ = 300 mSv/h, Te = 2 h, Ts = 1 h → D ≈ 101.7 mSv. Input: R₁ = 300, Te = 2 h 0 min, Ts = 1 h 0 min, dose field empty → Calculate.
:::

The nomogram visualises the calculation as in FM 3-3-1: the Te scale on the left, the Tₐ = Te + Ts scale on the right and the dose multiplier M = D / R₁ in the middle. A line between Te (left) and Tₐ (right) crosses the middle scale at the value of the multiplier. The total dose is D = R₁ · M.

## 6. Reference dose rate R₁ from measurement

If a dose rate R(t) is measured at time t after the burst, the reference dose rate R₁ at H+1 needed for the nomogram can be backcalculated:

```
R₁ = R(t) · t^1.2
```

Example: a measurement 4 hours after the burst yields 50 mSv/h → R₁ = 50 · 4^1.2 ≈ 264 mSv/h. With this R₁ the expected dose for a deployment can then be computed in the nuclear weapon calculator.

## 7. Unit conversion

Quick conversion between common dose and dose rate units. The target unit is restricted to units of the same type (dose or dose rate); incompatible combinations are hidden automatically.

- **Dose:** Sv, mSv, µSv, nSv, Gy, mGy, µGy, R, mR, µR
- **Dose rate:** Sv/h, mSv/h, µSv/h, nSv/h, Gy/h, mGy/h, µGy/h, R/h, mR/h, µR/h
- Rule of thumb: 1 R ≈ 0.01 Sv (gamma radiation, soft tissue)

## Use the calculation history

Each calculator keeps its own history. For every entry the inputs used, the calculated quantity, the formula and the timestamp are recorded. Clicking the trash icon removes individual entries; the history is not stored in the database and is lost when the page reloads. For permanent documentation transfer the results manually into the [operation log](/docs/tagebuch).
