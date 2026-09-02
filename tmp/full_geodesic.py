import numpy as np

# Full Schwarzschild geodesic (M=1) in (t, r, theta, phi)
def deriv(y, ):
    t, r, th, ph, td, rd, thd, phd = y
    f = 1.0 - 2.0/r
    # Christoffel-based accelerations
    tdd = -2*td*rd/(r*r*f)
    rdd = -(f)/(r*r)*td*td + 2*rd*rd/(r*r*f) + r*f*(thd*thd + np.sin(th)**2*phd*phd)
    thdd = -2*rd*thd/r + np.sin(th)*np.cos(th)*phd*phd
    phdd = -2*rd*phd/r - np.cos(th)/np.sin(th)*thd*phd
    return [td, rd, thd, phd, tdd, rdd, thdd, phdd]

def rk4(y, dt):
    k1 = deriv(y)
    k2 = deriv([y[i]+0.5*dt*k1[i] for i in range(8)])
    k3 = deriv([y[i]+0.5*dt*k2[i] for i in range(8)])
    k4 = deriv([y[i]+dt*k3[i] for i in range(8)])
    return [y[i] + dt/6*(k1[i]+2*k2[i]+2*k3[i]+k4[i]) for i in range(8)]

def cart_vel(r, th, ph, rd, thd, phd):
    st, ct = np.sin(th), np.cos(th)
    sp, cp = np.sin(ph), np.cos(ph)
    vx = rd*st*cp + r*thd*ct*cp - r*st*sp*phd
    vy = rd*st*sp + r*thd*ct*sp + r*st*cp*phd
    vz = rd*ct - r*thd*st
    return np.array([vx,vy,vz])

def trace_full(b, dt=0.001, R=100.0, maxsteps=400000):
    r0s = R
    f = 1-2/r0s
    phi_in = np.arctan2(b, -r0s)
    rd = -np.sqrt(max(1 - b*b*f/r0s**2, 0))
    y = [0.0, r0s, np.pi/2, phi_in, 1.0/f, rd, 0.0, b/r0s**2]
    v0 = cart_vel(y[1],y[2],y[3],y[5],y[6],y[7])
    minr = 1e9; captured=False
    for i in range(maxsteps):
        y = rk4(y, dt)
        r = y[1]; minr=min(minr,r)
        if r < 2.0: captured=True; break
        if r > R*1.02 and y[5] > 0:  # back out beyond start, moving outward
            break
    v1 = cart_vel(y[1],y[2],y[3],y[5],y[6],y[7])
    v0n=v0/np.linalg.norm(v0); v1n=v1/np.linalg.norm(v1)
    ang = np.degrees(np.arccos(np.clip(np.dot(v0n,v1n),-1,1)))
    return ang, minr, captured

print("b     full_geodesic   minr   cap   [simplified: 33.81, integral: 31.53]")
for b in [10, 8, 6, 5.5]:
    a,mr,cap = trace_full(b)
    print(f"{b:5.2f}   {a:10.4f}   {mr:7.4f}  {cap}")
