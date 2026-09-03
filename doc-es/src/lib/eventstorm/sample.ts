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
 * time order and the lanes are named, but there is a hotspot nobody has
 * resolved and an opportunity nobody has acted on — which is what a wall looks
 * like at the end of the session rather than a week later. A tidy example would
 * teach the notation and hide the point of the technique, which is that the
 * disagreements are the output.
 *
 * It is a **process-modelling** storm rather than a big-picture one, so all five
 * big-picture colours appear *and* the three the deeper level adds. The notation
 * is otherwise only described on the format page, and this is what people copy
 * from — a sample that showed half of it would leave the other half looking
 * theoretical.
 *
 * Nothing in the file says so. The commands and policies say it: the level is
 * discovered from the cards, and the board opens this at process modelling
 * because that is the shallowest lens that dims none of it. See `Level`.
 *
 * The payment lane carries the level's whole point in four squares: a command at
 * 3, the event it causes at 4, the policy that reacts at 5 and the event that
 * reacts to *it*. That is `event → policy → command → system → event` read off
 * the wall, which is the chain process modelling exists to make visible. The actor and
 * the external system sit at the same column as the events they touch rather
 * than in a lane of their own: on a real wall they are placed against the moment
 * they matter, and on this board that means the same square.
 *
 * It is also laid out to show what the grid is *for*, which a single row could
 * not. Three lanes run in parallel over one timeline. Several notes share a
 * column — column 5 carries a refusal, an acceptance and the hotspot between
 * them — which is the stacking the vertical axis exists to allow. And the
 * customer's lane is empty from column 4 to 7 while the payment and kitchen
 * lanes are busy, which is a gap: a visible hole on a wall, and a thing a list
 * cannot say at all.
 */

export const SAMPLE_FILENAME = 'ordering-a-pizza.eventstorm';

export const SAMPLE_SOURCE = `// Event storm exported by doc-es.
// Comments and blank lines in an imported file are not preserved: the board
// is the source, this file is a render of it.

eventstorm "Ordering a pizza" {
  product "client-onboarding"

  lane "Customer" {
    actor "Hungry customer" @1
    event "Menu opened" @1
    event "Pizza added to the basket" @2
    event "Basket emptied and started again" @2 {
      note "Happens more than anybody expected. Worth\\
            understanding before it is designed away."
    }
    event "Order placed" @3 +revenue
    event "Pizza delivered" @8
  }

  lane "Payments" {
    command "Take the payment" @3
    event "Payment requested" @4
    system "Payment provider" @4
    policy "Whenever a payment is refused, hold the order" @5
    event "Payment refused" @5 +revenue
    event "Payment accepted" @5
    hotspot "Nobody agrees whether a refused payment cancels the order" @5 +"ask payments" +revenue
  }

  lane "Kitchen" {
    readmodel "Orders waiting" @6
    event "Order sent to the kitchen" @6
    actor "Kitchen staff" @6
    event "Pizza put in the oven" @6
    opportunity "Tell the customer when it goes in the oven" @6
    event "Pizza handed to the driver" @7
  }
}
`;

/**
 * An empty storm, as text.
 *
 * The board opens on this. It has to be a real, parseable file rather than an
 * empty string, because the text is the document now: a gesture needs somewhere
 * to splice, and "add the first lane" needs a `{` to put it inside.
 *
 * No lane, deliberately. A storm with a lane is one somebody has started, and
 * the island shows the choice — load the example, or put up the wall — rather
 * than a grid of empty squares nobody asked for.
 */
export const EMPTY_SOURCE = `eventstorm "Untitled event storm" {
}
`;

/**
 * A fresh document under a name of its own.
 *
 * What the New button opens, and it opens a wall with its first lane on it rather than the choice of
 * how to start one. `EMPTY_SOURCE` is the empty state — no title of its own and
 * nothing on it — which is right for arriving at a page nobody has used yet and
 * wrong for a gesture that has already said what it wants. Somebody who presses
 * New has chosen; asking again is a step that answers a question they just
 * answered.
 *
 * So it comes with one lane, named badly on purpose and waiting to be
 * renamed: ba-ddd-mapper's `freshMap`, which writes one domain for the same
 * reason. Pressing New twice still leaves two drafts in the store rather than
 * one overwritten, because each takes a title nothing is using.
 */
export function freshSource(title: string): string {
	return `eventstorm ${JSON.stringify(title)} {\n  lane "New lane" {\n  }\n}\n`;
}
