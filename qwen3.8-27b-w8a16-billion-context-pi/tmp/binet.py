import numpy as np
from scipy.integrate import solve_ivp

def binet_deflection(b):
    # find r0 (closest approach): 1/b^2 = (1-2/r)/r^2
    from scipy.optimize import brentq
    f = lambda r: 1.0/b**2 - (1.0-2.0/r)/r**2
    rs = np.linspace(2.01, b*1.5, 20000)
    vals = f(rs)
    idx = np.where(np.sign(vals[:-1]) != np.sign(vals[1:]))[0]
    if len(idx)==0: return None
    r0 = brentq(f, rs[idx[-1]], rs[idx[-1]+1])
    u0 = 1.0/r0
    # d2u/dphi2 = -u + 3u^2 ; integrate from phi=0 (u=u0, du=0) until u ~ 0
    def rhs(phi, y):
        u, du = y
        return [du, -u + 3*u*u]
    sol = solve_ivp(rhs, [0, 200], [u0, 0.0], max_step=0.01, rtol=1e-10, atol=1e-12,
                    events=lambda p,y: y[0]-1e-6)
    phi_inf = sol.t[-1]
    alpha = 2*phi_inf - np.pi
    return np.degrees(alpha), r0

print("b      binet_defl(deg)  r0")
for b in [10, 8, 6, 5.5, 5.2]:
    res = binet_deflection(b)
    if res: print(f"{b:5.3f}   {res[0]:12.4f}   {res[1]:7.3f}")
