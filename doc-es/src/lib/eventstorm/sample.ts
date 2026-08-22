/**
 * The worked example, in the shape the serializer emits.
 *
 * Ordering a pizza, which is the warm-up the practice itself suggests — "do a
 * quick 20-minute warm-up on a familiar process, like recruitment or ordering a
 * pizza". A reader who has been in one of these workshops has almost certainly
 * stormed this exact process, and a sample everybody already knows teaches the
 * notation instead of the domain.
 *
 * It is deliberately a wall you would *not* call finished. The events are in
 * time order and the phases are named, but there is a hotspot nobody has
 * resolved and an opportunity nobody has acted on — which is what a wall looks
 * like at the end of the session rather than a week later. A tidy example would
 * teach the notation and hide the point of the technique, which is that the
 * disagreements are the output.
 *
 * All five Big Picture colours appear, because the notation is otherwise only
 * described on the format page and this is what people copy from. The actor and
 * the external system sit next to the events they touch rather than in a row of
 * their own: on a real wall they are placed against the moment they matter.
 */

export const SAMPLE_FILENAME = 'ordering-a-pizza.eventstorm';

export const SAMPLE_SOURCE = `// Event storm exported by doc-es.
// Comments and blank lines in an imported file are not preserved: the board
// is the source, this file is a render of it.

eventstorm "Ordering a pizza" {
  product "client-onboarding"

  phase "Choosing" {
    actor "Hungry customer"
    event "Menu opened"
    event "Pizza added to the basket"
    event "Basket emptied and started again" {
      note "Happens more than anybody expected. Worth\\
           understanding before it is designed away."
    }
    opportunity "Remember the last order"
  }

  phase "Paying" {
    event "Payment requested"
    system "Payment provider"
    event "Payment refused"
    event "Payment accepted"
    hotspot "Nobody agrees whether a refused payment cancels the order"
  }

  phase "Making and delivering" {
    event "Order sent to the kitchen"
    actor "Kitchen staff"
    event "Pizza put in the oven"
    event "Pizza handed to the driver"
    event "Pizza delivered"
  }
}
`;
