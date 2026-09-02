import numpy as np
from scipy.integrate import quad

def exact_deflection(b):
    # closest approach r0: 1/b^2 = (1-2/r)/r^2  =>  r^2/b^2 = 1-2/r => r^2 - b^2 + 2b^2/r = 0
    # solve for r0 (largest root > 2)
    f = lambda r: 1.0/b**2 - (1.0-2.0/r)/r**2
    # r0 is where f=0 and r>2; search
    rs = np.linspace(2.01, b*1.5, 20000)
    vals = f(rs)
    # find sign change (f goes + to - as r increases past r0? check)
    idx = np.where(np.sign(vals[:-1]) != np.sign(vals[1:]))[0]
    if len(idx)==0:
        return None, None
    # take the largest root (closest approach is the outer turning point)
    r0 = rs[idx[-1]+1]
    # refine
    from scipy.optimize import brentq
    r0 = brentq(f, rs[idx[-1]], rs[idx[-1]+1])
    integrand = lambda r: 1.0/(r**2*np.sqrt(max(1.0/b**2 - (1.0-2.0/r)/r**2, 1e-30)))
    val, _ = quad(integrand, r0, 200.0, limit=200)
    alpha = 2*val - np.pi
    return np.degrees(alpha), r0

print("b      exact_defl(deg)  r0")
for b in [10, 8, 6, 5.5, 5.2, 5.1, 5.0, 4.0]:
    a, r0 = exact_deflection(b)
    print(f"{b:5.3f}   {a:12.4f}   {r0:7.3f}")
