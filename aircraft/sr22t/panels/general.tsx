"use client";
import { selectSys } from "@/lib/fleet";
import { sysColor } from "@/lib/systems";
import { useView } from "@/lib/view";
import { adahrsAnnunciations, adahrsSources, mfdReversion, pfdReversion } from "../displays";
import { cabinLit, extLit, iceLightBreaker } from "../model";
import { CAT } from "../parts";
import { setDoor, useSR22T } from "../store";
import { SYS } from "../systems";
import { openWalk } from "../walk-store";
import {
  Caution,
  Check,
  Ctl,
  Facts,
  H3,
  Notes,
  PartsList,
  Readouts,
  Rocker,
  Seg,
  Small,
} from "@/components/ui/controls";

export function Overview() {
  const theme = useView((x) => x.theme);
  const fiki = useSR22T((x) => x.s.equip.fiki),
    up = useSR22T((x) => x.update);
  return (
    <>
      <p className="lead">
        A study model of POH Section 7 for the SR22T with Perspective+ avionics (G6). Pick a system to fly the camera to
        it, hover parts for their notes, and operate switches, levers and failures in the panel. Systems are linked:
        pull an alternator and watch buses, displays and the CAS window respond.
      </p>
      <button type="button" className="walk-link" onClick={() => openWalk()}>
        <b>Start preflight walk-around</b>
        <span>POH 4-4 – 4-9, stations 1–13: camera, highlights and the cabin switches, item by item</span>
      </button>
      <H3>Key figures</H3>
      <Facts
        rows={[
          ["Engine", "TSIO-550-K · 315 bhp @ 2,500 RPM (POH 1-7, 2-6)"],
          ["Propeller", "3-blade composite, 78 in., constant speed (POH 1-7, 2-8; Fig. 1-1)"],
          ["Fuel", "92 gal usable · 46 per wing (POH 1-7, 2-18, 7-40)"],
          ["Electrical", "28 V · ALT 100 A + 70 A · 2 batteries"],
          ["Flaps", "0 / 50% (16°) / 100% (35.5°) (POH 7-22)"],
          ["Avionics", "Garmin Perspective+, GFC 700 AP"],
          ["CAPS", "2,400 ft² canopy, rocket deployed"],
          ["Max takeoff weight", "3,600 lb (POH 1-8, 2-8)"],
          ["Max operating altitude", "25,000 ft MSL (POH 2-19)"],
        ]}
      />
      <H3>Equipment</H3>
      <Ctl>
        <Check
          id="sr22t-fiki"
          label="FIKI ice protection installed"
          checked={fiki}
          onChange={(v) =>
            up((d) => {
              d.equip.fiki = v;
            })
          }
        />
      </Ctl>
      <Small>
        Optional on the SR22T (POH 7-13); fitted to the modelled airplane. Clear it to see the airplane without ice
        protection.
      </Small>
      <H3>Systems</H3>
      <div className="overview-grid">
        {SYS.slice(1).map((s) => (
          <button
            key={s.id}
            type="button"
            style={{ "--c": sysColor(s.id, theme) } as React.CSSProperties}
            onClick={() => selectSys(s.id)}
          >
            <b>{s.name}</b>
            <span>{s.blurb}</span>
          </button>
        ))}
      </div>
      <p className="disc">
        Unofficial study aid built from SR22T POH/AFM P/N 13772-007 (Reissue A) and, where a note cites it, AMM P/N
        13773-002 (Rev 7). The POH governs where sources differ. Geometry is approximate and not to scale in detail. CAS
        messages use the POH Section 3 and 3A names, for the conditions the model simulates; their triggers are
        simplified. Always use the POH/AFM and supplements for your serial number.
      </p>
    </>
  );
}

export function Airframe() {
  return (
    <>
      <p className="lead">
        A composite monocoque fuselage with a built-in roll cage carries all flight loads through four wing attach
        points. One carbon spar runs uninterrupted from tip to tip beneath the front seats.
      </p>
      <Facts
        rows={[
          ["Cabin", "FS 100 firewall → FS 222 bulkhead"],
          ["Seats", "Pilot + up to 4 passengers"],
          ["Wing attach", "4 points: 2 under front seats, 2 at sidewall aft of rear seats"],
          ["Main spar", "Carbon/epoxy C-section, tip to tip"],
          ["Each wing", "47.25 gal integral tank + main gear"],
          ["Firewall", "20° lower bevel for crashworthiness"],
          ["Elevator / rudder", "Aluminum"],
          ["Stabilizer / fin", "Composite; fin integral with shell"],
        ]}
      />
      <H3>Structure — tap to locate</H3>
      <PartsList parts={CAT.pinned("airframe")} />
      <H3>Notes</H3>
      <Notes
        items={[
          "Wing skins bond to the spar, ribs and aft shear web to form a torsion box carrying all bending and torsion.",
          "The rear shear webs attach to the fuselage but, unlike the spar, don't carry through it.",
          "The avionics bay sits aft of FS 222, reached through an access panel on the right side of the tailcone.",
          "The POH text gives the height as 8.9 ft (2.71 m), but both the POH Figure 1-1 and AMM Figure 6-00-2 drawings draw about 2.9 m; the model follows the drawings.",
        ]}
      />
    </>
  );
}

export function Cabin() {
  return (
    <>
      <p className="lead">
        Seats, restraints and the emergency equipment you should be able to find with your eyes closed. Tap any item to
        locate it on the model.
      </p>
      <button className="btn" onClick={() => selectSys("doors")}>
        Door operation and latches →
      </button>
      <PartsList parts={CAT.pinned("cabin")} />
      <H3>Restraints</H3>
      <Notes
        items={[
          "Front: 4-point harness with an inflatable shoulder belt. A crash sensor under the floor fires the inflator; the bag deflates for egress. No slack between shoulder and strap.",
          "Rear: 3-point harness on inertia reels at the rear bulkhead. LATCH anchors in the outboard rear seats (2+1 bench).",
          "Seat bottoms have a honeycomb core that crushes to absorb vertical loads — don't kneel or stand on them.",
        ]}
      />
      <H3>ELT</H3>
      <Facts
        rows={[
          ["Unit", "Artex ELT 1000, 406 MHz"],
          ["Auto trigger", "4–5 ft/s Δv or CAPS deploy"],
          ["121.5 MHz", "Sweeps until battery exhausted"],
          ["406 MHz", "Burst every 50 s for 24 h, with GPS"],
          ["Panel switch", "ON · ARM/OFF · TEST"],
          ["Battery", "2 × D-cell lithium"],
        ]}
      />
      <H3>Other</H3>
      <Facts
        rows={[
          ["Extinguisher", "Halon 1211, class B/C, ~2.5 lb"],
          ["Egress hammer", "8 oz ball-peen, in armrest"],
          ["HOBBS", "BAT 1 + either ALT on"],
          ["FLIGHT meter", "Starts ~35 KIAS"],
          ["Hour meters", "5 A FUEL QTY, MAIN BUS 1 (POH 7-94)"],
          ["12 V outlet", "3.5 A max"],
          ["USB", "4 charging ports, 5 V 2.1 A"],
        ]}
      />
      <Caution title="Warning">
        Halon can be toxic in a closed cabin — ventilate (vents open, door unlatched) after discharging.
      </Caution>
      <H3>Baggage</H3>
      <Facts
        rows={[
          ["Maximum", "130 lb (59 kg) (POH 2-8)"],
          ["Floor limit", "130 lb distributed (POH 2-29 placard)"],
          ["Straps", "35 lb each maximum (POH 2-29 placard)"],
          ["Compartment", "36 × 39.8 × 38.5 in, 32 cu ft (POH 1-5)"],
          ["Arm", "FS 208.0 (POH 6-6)"],
        ]}
      />
    </>
  );
}

export function Lighting() {
  const s = useSR22T((x) => x.s),
    E = useSR22T((x) => x.E),
    up = useSR22T((x) => x.update);
  const lit = cabinLit(s, E),
    x = extLit(s, E),
    L = s.lights;
  const on = (b: boolean) => (b ? "ON" : "off");
  // switch on but nothing lit means a pulled breaker or a dead bus
  const ext = (sw: boolean, b: boolean): [string, "" | "bad"] | string => (b ? "ON" : sw ? ["NO PWR", "bad"] : "off");
  const flip = (k: "nav" | "strobe" | "land" | "ice") =>
    up((d) => {
      d.lights[k] = !d.lights[k];
    });
  return (
    <>
      <p className="lead">
        Each wingtip carries a navigation light with an integral anti-collision strobe, a recognition light in its
        leading edge and a white aft position light, so there is no tail light. A High Intensity Discharge (HID) landing
        light sits in the lower cowl. Ice inspection lights shine on the wing leading edges. Inside, convenience
        lighting (dome, baggage, footwell, entry-step) runs straight from BAT 1 through the CONV bus.
      </p>
      <H3>Exterior light switches</H3>
      <Ctl>
        <div className="switches">
          <Rocker label="NAV" on={L.nav} onToggle={() => flip("nav")} />
          <Rocker label="STROBE" on={L.strobe} onToggle={() => flip("strobe")} />
          <Rocker label="LAND" on={L.land} onToggle={() => flip("land")} />
          <Rocker label="ICE" on={L.ice} onToggle={() => flip("ice")} />
        </div>
        <Readouts
          items={[
            ["Nav + aft position", ext(L.nav, x.nav)],
            ["Strobes", ext(L.strobe, x.strobe)],
            ["Landing (cowl)", ext(L.land, x.land)],
            ["Recognition", ext(L.land, x.recog)],
            ["Ice inspection", ext(L.ice, x.ice)],
          ]}
        />
      </Ctl>
      <Small>
        Exterior glows show in the Overview and Lighting views. Pull a light&apos;s breaker, or lose its bus, to see it
        drop out: nav and strobes go with the NON ESS BUS (Main Dist Bus 2), the landing light with Main Dist Bus 1
        through its MCU fuse (BAT 1 after an ALT 1 failure), the recognition lights with MAIN BUS 3, the ice lights with
        MAIN BUS 1.
      </Small>
      <H3>Lights — tap to locate</H3>
      <PartsList parts={CAT.pinned("lighting")} />
      <H3>Cabin light switch</H3>
      <Ctl>
        <Seg
          id="cabsw"
          label="Ceiling switch"
          options={[
            ["OFF", "OFF"],
            ["ON", "ON"],
            ["AUTO", "AUTO"],
          ]}
          value={L.cabin}
          onChange={(v) =>
            up((d) => {
              d.lights.cabin = v;
            })
          }
        />
        <Check
          id="door"
          label="A cabin door is open or unlatched"
          checked={L.door}
          onChange={(v) => setDoor({ cabinLights: v })}
        />
        <Check
          id="fob"
          label="Unlocked with key fob"
          checked={L.unlocked}
          onChange={(v) =>
            up((d) => {
              d.lights.unlocked = v;
            })
          }
        />
        <Check
          id="bagdoor"
          label="Baggage door open"
          checked={L.bag}
          onChange={(v) => setDoor({ baggage: v ? "open" : "closed" })}
        />
        <Readouts
          items={[
            ["Dome", on(lit.dome)],
            ["Footwell", on(lit.foot)],
            ["Entry steps", on(lit.step)],
            ["Baggage", on(lit.bag)],
          ]}
        />
      </Ctl>
      <Small>
        The key fob won&apos;t work the door locks while BAT 1 is on. With aircraft power off, convenience lights time
        out after a few minutes.
      </Small>
      <H3>Instrument dimmer</H3>
      <Notes
        items={[
          "Full counter-clockwise is OFF = daytime mode: keypads, bolster and standby unlit; PFD/MFD brightness on photocell (full bright).",
          "Turning it on dims the displays to night levels and lights the keys, switches and standby bezels.",
          "PANEL knob controls red LED floods under the glareshield and dims the front reading lights.",
        ]}
      />
      <H3>Notes</H3>
      <Notes
        items={[
          "There is no tail light: the rearward white position light is built into each wingtip trailing edge and comes on with NAV.",
          "LAND lights the cowl landing light and both recognition lights.",
          "Ice inspection lights are for checking the leading edges at night. Many pilots use them only for quick checks because they cost night vision.",
        ]}
      />
      <H3>Power</H3>
      <Facts
        rows={[
          ["Instrument/panel/reading/dome", "5 A CABIN LIGHTS, MAIN BUS 1"],
          ["Convenience lights", "5 A CONV LIGHTS, CONV bus"],
          ["Nav / strobe", "5 A each, NON ESS BUS (POH 7-57)"],
          ["Landing", "7.5 A fuse, Main Dist Bus 1 (MCU), POH 7-57"],
          ["Recognition", "15 A LANDING LIGHTS, MAIN BUS 3 (POH 7-57)"],
          [
            "Ice inspection",
            iceLightBreaker(s.equip) === "ICE PROTECT 1"
              ? "7.5 A ICE PROTECT 1, MAIN BUS 1 (AMM 30-80)"
              : "5 A ICE LIGHTS, MAIN BUS 1 (AMM 30-80, 33-40)",
          ],
        ]}
      />
    </>
  );
}

export function Avionics() {
  const s = useSR22T((x) => x.s),
    E = useSR22T((x) => x.E),
    up = useSR22T((x) => x.update),
    src = adahrsSources(E),
    ann = adahrsAnnunciations(E);
  return (
    <>
      <p className="lead">
        Garmin Perspective+: two 10 in. displays (12 in. optional), dual integrated avionics units, dual ADAHRS with two
        magnetometers, and an engine/airframe unit. The displays in the model are live — they go dark if their buses die
        and revert automatically.
      </p>
      <H3>Try it</H3>
      <Ctl>
        <Check
          id="dbackup"
          label="Press DISPLAY BACKUP"
          checked={s.avx.backup}
          onChange={(v) =>
            up((d) => {
              d.avx.backup = v;
            })
          }
        />
        <Check
          id="pfdfail"
          label="PFD fails (auto reversion)"
          checked={s.avx.pfdFail}
          onChange={(v) =>
            up((d) => {
              d.avx.pfdFail = v;
            })
          }
        />
        <Readouts
          items={[
            ["PFD", E.pfd ? (pfdReversion(s, E) ? "Backup" : "ON") : ["OFF", "bad"]],
            ["MFD", E.mfd ? (mfdReversion(s, E) ? "Backup" : "ON") : ["OFF", "bad"]],
            ["Standby", E.stby ? "ON" : ["OFF", "bad"]],
            ["Avionics bus", E.avx > 0 ? "ON" : ["OFF", "warnc"]],
          ]}
        />
        {(["adahrs1", "adahrs2", "mag1", "mag2"] as const).map((k) => (
          <Check
            key={k}
            id={k}
            label={`${k.startsWith("mag") ? "MAG" : "ADAHRS"} ${k.slice(-1)} fails`}
            checked={s.avx.fail[k]}
            onChange={(v) =>
              up((d) => {
                d.avx.fail[k] = v;
              })
            }
          />
        ))}
        <Readouts
          items={[
            ["ADAHRS 1", E.adahrs1 ? "ON" : ["OFF", "warnc"]],
            ["ADAHRS 2", E.adahrs2 ? "ON" : ["OFF", "warnc"]],
            ["Attitude / air data", src.att ? `ADAHRS ${src.att}` : ["red X", "bad"]],
            ["OAT source", src.oat ? `OAT ${src.oat} / ADC ${src.oat}` : ["Unavailable", "bad"]],
            ["Heading", src.hdg ? `ADAHRS ${src.hdg} + MAG ${src.hdg}` : ["HDG", "bad"]],
            ["PFD comparators", ann.comparators.length ? ann.comparators.map((c) => c.text).join(" · ") : "—"],
            ["PFD sensors", ann.reversionary.length ? ann.reversionary.join(" · ") : "—"],
          ]}
        />
      </Ctl>
      <H3>Dual power paths</H3>
      <Facts
        rows={[
          ["PFD", "PFD A ESS 1 · PFD B MAIN 2"],
          ["MFD", "MFD A MAIN 3 · MFD B MAIN 1"],
          ["Standby MD302", "ESS 1 + MAIN 1 via diodes"],
          ["ADAHRS 1 / 2", "ESS 1 / MAIN 2"],
          ["MAG 1 / 2", "PFD A ESS 1 / PFD B MAIN 2 (AMM 34-20)"],
          ["GIA 1", "COM 1 + GPS NAV, ESS 1"],
          ["GIA 2", "COM 2 + GPS NAV, MAIN 2"],
          ["GEA 71", "3 A ENGINE INSTR, ESS 2"],
          ["Audio · XPDR", "AVIONICS bus"],
          ["Yaw servo", "YAW SERVO 3 A, MAIN BUS 3 (AMM 22-10; POH Fig 7-11)"],
        ]}
      />
      <H3>CAS colors</H3>
      <Facts
        rows={[
          ["Red warning", "Immediate awareness and action"],
          ["Amber caution", "Immediate awareness, later action"],
          ["White advisory", "Awareness; action may follow"],
        ]}
      />
      <H3>Notes</H3>
      <Notes
        items={[
          "Fixed cruise picture: illustrative, derived from POH 5-32 — 156 KTAS at 4,000 ft, ISA, 65% power. About 147 KIAS assumes CAS≈IAS and equivalent airspeed≈CAS, without calibration or compressibility correction. Display altitude follows the pressure-altitude setting (initially 4,000 ft); the airspeed picture does not track altitude, power or atmosphere.",
          "GFC 700 with yaw damper (POH 7-72; installed on this airplane); autopilot operation is described in AFM Supplement 13772-159 (POH 7-79).",
          "Typical alignment is 60 seconds after battery on (POH 7-74).",
          "Dual ADAHRS and MAG 2 are installed on this airplane (operator, 2026-10-08). Both OAT probes are on the RH wing (operator observation of the modelled airplane, plus AMM Fig 34-10-6); side-by-side spacing approximate, each feeds its own ADC (POH 7-75). Selected-side ADC OAT is used for Baro-VNAV (POH 7-80/7-81); both probes read the shared outside-air temperature here. Independent OAT faults and Baro-VNAV guidance are not simulated. MAG 1 feeds ADAHRS 1, MAG 2 feeds ADAHRS 2 (POH Fig 7-17). If one ADAHRS fails, the system switches to the functioning one (POH 3-43) and the PFD shows USING AHRS2 / USING ADC2 above the roll scale while it reads ADAHRS 2 (Perspective+ Pilot's Guide 190-02183-01 Fig 2-48). With one air data computer left, VDI NO COMP posts in the PFD's sensor comparison annunciation area in black text on a white background (POH 7-81), with the ALT, IAS, PIT, ROL and HDG no-compare boxes (Pilot's Guide Fig 2-47, Table 2-4); places on the PFD approximate. Only with both lost do the red X's appear (POH 3-43).",
          "On a detected display failure the remaining screen shows PFD data plus engine indication with no pilot action. The red DISPLAY BACKUP button between the displays puts both in that mode; press it again to exit (POH 7-74).",
          "Baro-VNAV provides LNAV/VNAV guidance without SBAS (magenta pentagon). No SBAS→baro downgrade inside 60 s of the FAF (POH 7-79, 7-80).",
          "Three fans cool the stack: AVIONICS FAN 1, 5 A (NON ESS), cools the MFD; FAN 2, 5 A (MAIN 2), cools the PFD and integrated avionics units (POH 7-90). AMM 21-20 gives FAN 1 as 3 A; POH governs.",
        ]}
      />
      <PartsList parts={CAT.pinned("avionics")} />
    </>
  );
}

/** POH 13772-007 7-31/7-26 and 3A-6; AMM 13773-002 Rev 7 ch. 52. */
export function Doors() {
  const doors = useSR22T((x) => x.s.doors);
  const fly = useView((x) => x.flyTo);
  return (
    <>
      <p className="lead">
        Two forward-hinged cabin doors swing up and forward with gas-strut assistance. Each handle operates upper and
        lower aft latches; front armrests are part of the doors (POH 7-31). The left baggage door is aft of the wing,
        hinged forward and latched aft (POH 7-26).
      </p>
      <H3>Cabin doors</H3>
      <Ctl>
        {(["L", "R"] as const).map((side) => (
          <Seg
            key={side}
            id={"cabin-door-" + side}
            label={(side === "L" ? "Left" : "Right") + " cabin door"}
            options={[
              ["latched", "Latched"],
              ["unlatched", "Unlatched"],
              ["open", "Open"],
            ]}
            value={doors[side]}
            onChange={(position) => setDoor({ cabin: side, position })}
          />
        ))}
      </Ctl>
      <Small>
        Lift the exterior lever to disengage both latches, then the strut assists raising the door. The slam catch and
        draw-in latch use pull cable and linkage. The interior lever nests in the armrest when latched and juts into the
        forearm when unlatched (AMM 52-10, PDF 2006; Fig 52-10-3, PDF 2027).
      </Small>
      <H3>Baggage door</H3>
      <Ctl>
        <Check
          id="doors-bag"
          label="Open baggage door"
          checked={doors.bag === "open"}
          onChange={(open) => setDoor({ baggage: open ? "open" : "closed" })}
        />
        <Check
          id="doors-bag-lock"
          label="Lock baggage door with key (outside)"
          checked={doors.bagLocked}
          onChange={(bagLocked) => setDoor({ bagLocked })}
        />
        <Readouts
          items={[
            ["Baggage door", doors.bagLocked ? "Locked" : doors.bag === "open" ? "Open" : "Closed"],
            ["Cabin door cue", doors.L !== "latched" || doors.R !== "latched" ? "Handle raised" : "Handles nestled"],
          ]}
        />
      </Ctl>
      <Small>
        Unlock before opening; close before locking. Cabin and baggage keys interchange (POH 7-26, 7-31). Each cabin
        door has an exterior key lock; it cannot be locked from inside and does not hinder escape from within (AMM 52-10
        PDF 2006; Fig 52-10-5 PDF 2031). The baggage door on the modelled airplane has a piano hinge and lanyard,
        without a gas strut (AMM Fig 52-30-1 sheet 1, PDF 2055).
      </Small>
      <H3>Inspect</H3>
      <div className="switches">
        <button className="btn" onClick={() => fly([3.5, 2.1, -4.1], [1, 0.15, 0])}>
          Outside left
        </button>
        <button className="btn" onClick={() => fly([3.5, 2.1, 4.1], [1, 0.15, 0])}>
          Outside right
        </button>
        <button className="btn" onClick={() => fly([1.05, 0.3, 0.25], [1.35, 0.12, -0.58])}>
          Inside left
        </button>
        <button className="btn" onClick={() => fly([1.05, 0.3, -0.25], [1.35, 0.12, 0.58])}>
          Inside right
        </button>
      </div>
      <H3>Door Open In Flight — POH 3A-6</H3>
      <Caution title="Airplane Control … MAINTAIN">
        The doors on the airplane will remain 1-3 inches open in flight if not latched. If this is discovered on takeoff
        roll, abort takeoff if practical. If already airborne do not allow efforts to close the door interfere with the
        primary task of maintaining control of the airplane.
      </Caution>
      <Notes
        items={[
          "No door-ajar CAS or annunciation is specified in POH Sections 2, 3, 3A or 7. The raised interior handle is the unlatched cue (AMM 52-10, PDF 2006). The model does not simulate an unlatched door's in-flight motion.",
          "Cabin door opening: top 32.0 in, side height 33.3 in; front height 33.4 in and roof wrap 20.0 in (POH Fig 1-2, 1-5, PDF 15). Jamb overlap, hinge/bracket coordinates, hardware dimensions and 70° full-open angles are approximate. Edge gap follows 0.060–0.125 in (AMM Fig 52-10-2, PDF 2016).",
          "Convenience lighting: an open cabin door triggers entry-step/dome lights; an open baggage door triggers baggage lights (POH 7-60). Existing key-fob lighting remains in Lighting; proximity sensors and lock solenoids are not drawn without installation confirmation.",
          "If a mishap jams the doors, use the emergency egress hammer to break the acrylic windows (POH 7-94). See Cabin & safety for the hammer and restraints.",
        ]}
      />
      <button className="btn" onClick={() => selectSys("cabin")}>
        Cabin & safety →
      </button>
      <H3>Door hardware — tap to locate</H3>
      <PartsList parts={CAT.pinned("doors")} />
    </>
  );
}
