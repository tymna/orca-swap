use anchor_lang::prelude::*;
use crate::orca;

#[derive(Accounts)]
pub struct Swap<'info> {
    /// CHECK: validated by Whirlpool program 
    pub token_program: AccountInfo<'info>, // SPL (handles basic operations) TokenkegQEqKoZ8FqQBaGGkEIBCSTNviepLNiAXKSA9
    pub token_authority: Signer<'info>, // pub key + sig

    /// CHECK: validated by Whirlpool program
    #[account(mut)]
    pub whirlpool: AccountInfo<'info>, // SOL/USDC Whirlpool 3KBZiL2g8C7tiJ32hTv5v3KM7aK9htpqTw4cTXz1HvPt

    /// CHECK: validated by Whirlpool program
    #[account(mut)]
    pub token_owner_account_a: AccountInfo<'info>, // address of account with WSOL

    /// CHECK: validated by Whirlpool program
    #[account(mut)]
    pub token_vault_a: AccountInfo<'info>, // WSOL pool C9zLV5zWF66j3rZj3uuhDqvfuA8esJyWnruGzDW9qEj2

    /// CHECK: validated by Whirlpool program
    #[account(mut)]
    pub token_owner_account_b: AccountInfo<'info>, // address of account with devUSDC

    /// CHECK: validated by Whirlpool program
    #[account(mut)]
    pub token_vault_b: AccountInfo<'info>, // devUSDC pool 7DM3RMz2yzUB8yPRQM3FMZgdFrwZGMsabsfsKopWktoX

    /// CHECK: validated by Whirlpool program
    #[account(mut)]
    pub tick_array_0: AccountInfo<'info>,

    /// CHECK: validated by Whirlpool program
    #[account(mut)]
    pub tick_array_1: AccountInfo<'info>,

    /// CHECK: validated by Whirlpool program
    #[account(mut)]
    pub tick_array_2: AccountInfo<'info>,

    /// CHECK: validated by Whirlpool program
    pub oracle: AccountInfo<'info>, //

    /// CHECK: Orca Whirlpool program
    pub whirlpool_program: AccountInfo<'info>, // whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc
}

pub fn handler(
        ctx: Context<Swap>, 
        amount: u64,
        other_amount_threshold: u64,
        sqrt_price_limit: u128,
        amount_specified_is_input: bool,
        a_to_b: bool,
    ) -> Result<()> {
    orca::swap_cpi(
        &ctx,
        amount,
        other_amount_threshold,
        sqrt_price_limit,
        amount_specified_is_input,
        a_to_b,
    )
}

  

