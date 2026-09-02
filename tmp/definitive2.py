import mpmath as mp, numpy as np
mp.mp.dps = 30
def exact_deflection(b):
    b = mp.mpf(b)
    f = lambda r: r**3 - b**2*r + 2*b**2
    r0 = mp.findroot(f, b)
    u0 = 1/r0
    g = lambda u: b/mp.sqrt(1 - b**2*u**2 + 2*b**2*u**3)
    h = lambda t: g(u0*mp.sin(t))*u0*mp.cos(t)
    val = mp.quad(h, [0, mp.pi/2])
    return float(mp.degrees(2*val - mp.pi)), float(r0)

def simp_deflection(b, dt=0.0005, R=400.0):
    px,py,vx,vy = -R, b, 1.0, 0.0
    L2 = (px*vy-py*vx)**2
    def acc(px,py):
        r2=px*px+py*py; r=np.sqrt(r2); c=-3*L2/(r2*r2*r); return c*px,c*py
    minr=1e9
    for i in range(3000000):
        r=np.hypot(px,py); minr=min(minr,r)
        if r<2: return None,minr,True
        if r>R*1.05 and (px*vx+py*vy)>0: break
        ax,ay=acc(px,py)
        k1x,k1y=vx,vy
        ax2,ay2=acc(px+.5*dt*k1x,py+.5*dt*k1y); k2x,k2y=vx+.5*dt*ax,vy+.5*dt*ay
        ax3,ay3=acc(px+.5*dt*k2x,py+.5*dt*k2y); k3x,k3y=vx+.5*dt*ax2,vy+.5*dt*ay2
        ax4,ay4=acc(px+dt*k3x,py+dt*k3y); k4x,k4y=vx+dt*ax3,vy+dt*ay3
        px+=dt/6*(k1x+2*k2x+2*k3x+k4x); py+=dt/6*(k1y+2*k2y+2*k3y+k4y)
        vx+=dt/6*(ax+2*ax2+2*ax3+ax4); vy+=dt/6*(ay+2*ay2+2*ay3+ay4)
    return np.degrees(np.arctan2(vy,vx)), minr, False

for b in [10, 8, 6]:
    ea,er0 = exact_deflection(b)
    sa,smr,cap = simp_deflection(b)
    print(f"b={b}: exact={ea:9.4f} (r0={er0:.4f}) | simp={sa:9.4f} (minr={smr:.4f})")
