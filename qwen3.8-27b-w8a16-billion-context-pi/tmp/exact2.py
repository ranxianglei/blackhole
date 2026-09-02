import numpy as np
from scipy.optimize import brentq

def exact_deflection(b, N=2000000):
    f = lambda r: 1.0/b**2 - (1.0-2.0/r)/r**2
    rs = np.linspace(2.01, b*1.5, 20000)
    vals = f(rs)
    idx = np.where(np.sign(vals[:-1]) != np.sign(vals[1:]))[0]
    if len(idx)==0: return None, None
    r0 = brentq(f, rs[idx[-1]], rs[idx[-1]+1])
    # alpha = 2 * int_{r0}^{inf} b dr / (r^2 sqrt(1 - b^2(1-2/r)/r^2)) - pi
    # substitute r = r0 + t^2, dr = 2t dt, t from 0 to sqrt(inf)
    # integrand in t: b * 2t / ((r0+t^2)^2 * sqrt(1 - b^2(1-2/(r0+t^2))/(r0+t^2)^2))
    def g(t):
        r = r0 + t*t
        disc = 1.0 - b*b*(1.0-2.0/r)/(r*r)
        if disc <= 0: return 0.0
        return b*2*t/(r*r*np.sqrt(disc))
    # integrate t from 0 to T where r=T^2+r0 is large (say r=500 -> T=sqrt(500-r0))
    T = np.sqrt(500.0 - r0)
    ts = np.linspace(0, T, N)
    gs = np.array([g(t) for t in ts])
    val = np.trapezoid(gs, ts)
    alpha = 2*val - np.pi
    return np.degrees(alpha), r0

print("b      exact_defl(deg)  r0     [my3D: 33.8,49.2,98.5,146.2]")
for b in [10, 8, 6, 5.5]:
    a, r0 = exact_deflection(b)
    print(f"{b:5.3f}   {a:12.4f}   {r0:7.3f}")
