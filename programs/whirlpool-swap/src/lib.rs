use anchor_lang::prelude::*;

declare_id!("GRD4AsZgQoeb5MjPmdm5HJUFYuvi54sJj19rmTkFgHLe");

mod instructions;
mod orca;

use instructions::*;

#[program]
pub mod whirlpool_swap {
    use super::*;
    
    pub fn swap(
        ctx: Context<Swap>,
        amount: u64,
        other_amount_threshold: u64,
        sqrt_price_limit: u128,
        amount_specified_is_input: bool,
        a_to_b: bool,
    ) -> Result<()> {
        instructions::swap::handler(ctx, amount, other_amount_threshold, sqrt_price_limit, amount_specified_is_input, a_to_b) 
    }
}

#[event]
pub struct SwapExecuted {
    pub user: Pubkey,
    pub amount_in: u64,
    pub a_to_b: bool,
}





